import { beforeEach, describe, expect, it, vi } from "vitest";
import { configDeProducao, corpoDoSerpro, TENANT, transporteFalso } from "@/lib/serpro/teste.fixture";

// O lote da conferência com transporte falso (20/10/2026): o 429 e o 504
// pausam o ciclo sem contar o cliente, a trava no cursor segura dois ciclos ao
// mesmo tempo, e a demonstração não confere ninguém. O `chamarSerpro` é o de
// verdade; só o banco, a cifra, os avisos e a carteira são de mentira.

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("@/lib/serpro/teste.fixture");
  return { banco: bancoFalso(), notifyUser: vi.fn(), notifySector: vi.fn(), logAudit: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco.prisma }));
vi.mock("@/lib/integracoes/data", () => ({
  lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}),
  executar: async (_p: unknown, corpo: () => Promise<{ resultado: unknown }>) => (await corpo()).resultado,
}));
vi.mock("@/lib/notifications", () => ({ notifyUser: m.notifyUser, notifySector: m.notifySector }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));

// A carteira: cinco clientes, um por raiz.
const CHAVES = ["10000001", "10000002", "10000003", "10000004", "10000005"];
const documento = (chave: string) => `${chave}000199`;
vi.mock("./servidor", () => ({
  carteiraDasAutorizacoes: async () => ({ linhas: CHAVES.map((chave) => ({ chave, situacao: "falta_pedir" })) }),
  representantesDasChaves: async () => new Map(CHAVES.map((c) => [c, { documento: documento(c) }])),
  setorDasAutorizacoes: async () => "fiscal",
}));

const { esquecerTokens } = await import("@/lib/serpro/cliente");
const { NA_DEMONSTRACAO, pedirConferenciaGeral, processarConferencias } = await import("./serpro");

const PEDIDO = { pedidaEm: "2026-10-20T09:00:00.000Z", pedidaPor: "kauan", total: 5, ativas: 0, sem: 0, erros: 0 };
const cursor = (extra: Record<string, unknown> = {}) => JSON.stringify({ conferencia: { ...PEDIDO, ...extra } });
const lerCursor = () => {
  const c = m.banco.estado.conexao!.cursor;
  return c ? (JSON.parse(c) as { conferencia: typeof PEDIDO & { rodandoDesde?: string | null; pausas?: number } }).conferencia : null;
};
const ativa = { status: 200, corpo: corpoDoSerpro([{ dtexpiracao: "20301231", nrsistemas: 1, sistemas: ["PGDAS-D"] }]) };
const avisos = () => m.notifyUser.mock.calls.map(([, aviso]) => (aviso as { message: string }).message);

beforeEach(() => {
  m.banco.zerar();
  esquecerTokens();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("o lote da conferência", () => {
  it("todos respondem: confere os cinco, grava as autorizações e avisa que terminou", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    const t = transporteFalso(() => ativa);
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(5);
    expect(lerCursor()).toBeNull();
    expect(m.banco.estado.autorizacoes.get("10000003")).toMatchObject({ status: "ACTIVE", checkedVia: "SERPRO" });
    expect(avisos()).toEqual([expect.stringMatching(/terminou: 5 com autorização ativa, 0 sem autorização/)]);
  });

  it("429 encerra o ciclo sem contar o cliente; o próximo ciclo continua dele", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    const cota = transporteFalso((_r, n) => (n === 2 ? { status: 429 } : ativa));
    expect(await processarConferencias(TENANT, { transporte: cota.transporte })).toBe(2);
    // Parou no terceiro: nem tentou o quarto e o quinto.
    expect(cota.chamadas()).toHaveLength(3);
    expect(lerCursor()).toMatchObject({ ativas: 2, erros: 0, rodandoDesde: null, pausas: 0 });
    expect(avisos()).toEqual([]);

    const depois = transporteFalso(() => ativa);
    expect(await processarConferencias(TENANT, { transporte: depois.transporte })).toBe(3);
    expect(JSON.parse(depois.chamadas()[0].corpo).contribuinte.numero).toBe(documento("10000003"));
    expect(lerCursor()).toBeNull();
    expect(avisos()).toEqual([expect.stringMatching(/terminou: 5 com autorização ativa/)]);
  });

  it("504 pausa em vez de encerrar o lote", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    const t = transporteFalso(() => ({ status: 504 }));
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(0);
    expect(t.chamadas()).toHaveLength(1);
    expect(lerCursor()).toMatchObject({ ativas: 0, erros: 0, pausas: 1 });
    expect(avisos()).toEqual([]);
  });

  it("seis pausas seguidas sem conferir ninguém: desiste e avisa", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor({ pausas: 5 }) });
    const t = transporteFalso(() => ({ status: 429 }));
    await processarConferencias(TENANT, { transporte: t.transporte });
    expect(lerCursor()).toBeNull();
    expect(avisos()).toEqual([expect.stringMatching(/parou: o Serpro respondeu “Limite de chamadas.*” em 6 ciclos seguidos/)]);
  });

  it("403 é da ligação: para o lote e avisa", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    const t = transporteFalso(() => ({ status: 403, corpo: JSON.stringify({ mensagens: [{ codigo: "[AcessoNegado-ICGERENCIADOR-016]", texto: "" }] }) }));
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(0);
    expect(t.chamadas()).toHaveLength(1);
    expect(m.banco.estado.chamadas[0]).toMatchObject({ httpStatus: 403, cobrada: true });
    expect(lerCursor()).toBeNull();
    expect(avisos()).toEqual([expect.stringMatching(/parou: O CNPJ do certificado é diferente/)]);
  });

  it("o 200 com ERRO é erro do cliente: não cancela a autorização ativa", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    m.banco.estado.autorizacoes.set("10000001", {
      status: "ACTIVE",
      requestedAt: null,
      receivedAt: null,
      validatedAt: null,
      expiresAt: new Date("2030-12-31T12:00:00Z"),
      allServices: true,
      services: null,
    });
    const erro = { status: 200, corpo: JSON.stringify({ status: 400, dados: null, mensagens: [{ codigo: "ERRO", texto: "Dados inválidos." }] }) };
    const t = transporteFalso((_r, n) => (n === 0 ? erro : ativa));
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(5);
    expect(m.banco.estado.autorizacoes.get("10000001")).toMatchObject({ status: "ACTIVE" });
    expect(avisos()).toEqual([expect.stringMatching(/terminou: 4 com autorização ativa, 0 sem autorização, 1 com erro/)]);
  });

  it("outro ciclo rodando: não chama ninguém; a trava vencida (ciclo que morreu) é tomada", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor({ rodandoDesde: new Date(Date.now() - 5 * 60_000).toISOString() }) });
    const t = transporteFalso(() => ativa);
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(0);
    expect(t.chamadas()).toHaveLength(0);

    m.banco.conectar(configDeProducao(), { cursor: cursor({ rodandoDesde: new Date(Date.now() - 31 * 60_000).toISOString() }) });
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(5);
  });

  it("dois ciclos ao mesmo tempo: só um confere (e paga)", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    const t = transporteFalso(() => ativa);
    const feitas = await Promise.all([processarConferencias(TENANT, { transporte: t.transporte }), processarConferencias(TENANT, { transporte: t.transporte })]);
    expect(feitas.sort()).toEqual([0, 5]);
    expect(t.chamadas()).toHaveLength(5);
    expect(avisos()).toHaveLength(1);
  });

  it("o ciclo não começa cliente novo depois de 20 minutos", async () => {
    m.banco.conectar(configDeProducao(), { cursor: cursor() });
    let relogio = Date.now();
    const t = transporteFalso(() => {
      relogio += 8 * 60_000;
      return ativa;
    });
    expect(await processarConferencias(TENANT, { transporte: t.transporte, agora: () => relogio })).toBe(3);
    expect(lerCursor()).toMatchObject({ ativas: 3, rodandoDesde: null });
    expect(avisos()).toEqual([]);
  });

  it("na demonstração: o lote pedido antes da troca acaba sem chamar, e não se pede outro", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" }, { cursor: cursor() });
    const t = transporteFalso(() => ativa);
    expect(await processarConferencias(TENANT, { transporte: t.transporte })).toBe(0);
    expect(t.chamadas()).toHaveLength(0);
    expect(lerCursor()).toBeNull();
    expect(avisos()).toEqual([expect.stringMatching(/demonstração/)]);
    expect(await pedirConferenciaGeral(TENANT, "kauan")).toEqual({ ok: false, erro: NA_DEMONSTRACAO });
  });
});
