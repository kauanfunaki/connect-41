import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDoModelo } from "@/lib/drive/regras";
import { configDeProducao, TENANT, transportePorServico } from "./teste.fixture";
import { PROTOCOLO_DO_SITFIS, RELATORIO_DO_SITFIS } from "./receita.fixture";

// O Sitfis do clique ao PDF (Fase 1, 20/10/2026), com transporte falso e
// relógio de mentira: o `esperar` avança o relógio em vez de dormir. O que
// importa provar é que o Emitir nunca sai antes do tempo de espera — o 202 de
// quem chega cedo é cobrado.

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("./teste.fixture");
  return {
    banco: bancoFalso(),
    notifyUser: vi.fn(),
    logAudit: vi.fn(),
    isModuleEnabled: vi.fn(async () => true),
    guardarArquivo: vi.fn(async (input: { folderId: string; arquivo: File }) => ({ ok: true as const, arquivoId: "arquivo-1", nome: input.arquivo.name })),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco.prisma }));
vi.mock("@/lib/integracoes/data", () => ({
  lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}),
  executar: async (_p: unknown, corpo: () => Promise<{ resultado: unknown }>) => (await corpo()).resultado,
}));
vi.mock("@/lib/notifications", () => ({ notifyUser: m.notifyUser, notifySector: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.isModuleEnabled }));
vi.mock("@/lib/drive/servidor", () => ({
  garantirPastasDaEmpresa: async () => [{ id: "m-fiscal", name: "Fiscal", active: true }],
  guardarArquivo: m.guardarArquivo,
}));

const { esquecerTokens } = await import("./cliente");
const { pedirSituacaoFiscal, processarPedidosDoSitfis } = await import("./situacaoFiscal");

/** 11.444.777/0001-61: o CNPJ de exemplo, válido, de ninguém. */
const EMPRESA = { id: "empresa-1", tenantId: TENANT, name: "Empresa Fictícia Ltda", kind: "PESSOA_JURIDICA", cnpj: "11444777000161" };
const ativa = { status: "ACTIVE", requestedAt: null, receivedAt: null, validatedAt: null, expiresAt: new Date("2030-12-31T12:00:00Z"), allServices: true, services: null };

let relogio = new Date("2026-10-20T10:00:00-03:00");
const esperas: number[] = [];
const opcoes = (transporte: ReturnType<typeof transportePorServico>["transporte"]) => ({
  transporte,
  agora: () => relogio,
  esperar: async (ms: number) => {
    esperas.push(ms);
    relogio = new Date(relogio.getTime() + ms);
  },
});
const pedidos = () => m.banco.tabelas.serproPedido.linhas;

beforeEach(() => {
  m.banco.zerar();
  esquecerTokens();
  vi.clearAllMocks();
  relogio = new Date("2026-10-20T10:00:00-03:00");
  esperas.length = 0;
  m.banco.conectar(configDeProducao());
  m.banco.tabelas.company.linhas.push({ ...EMPRESA, displayName: null, cpf: null });
  m.banco.tabelas.driveFolder.linhas.push({ id: "pasta-fiscal", tenantId: TENANT, companyId: EMPRESA.id, parentId: null, deletedAt: null, name: "Fiscal", systemKey: chaveDoModelo("m-fiscal") });
  m.banco.estado.autorizacoes.set("11444777", ativa);
});

describe("pedir a situação fiscal na ficha", () => {
  it("pede o protocolo, espera o tempo do Serpro e emite; o PDF vai para a pasta Fiscal", async () => {
    const t = transportePorServico({ SOLICITARPROTOCOLO91: () => PROTOCOLO_DO_SITFIS, RELATORIOSITFIS92: () => RELATORIO_DO_SITFIS });
    const r = await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));

    expect(r).toEqual({ ok: true, texto: "Situação fiscal pronta: está nos Arquivos › Fiscal.", pronto: true });
    // 4 s do Serpro e 2 s de folga, antes de emitir.
    expect(esperas).toEqual([6000]);
    expect(JSON.parse(JSON.parse(t.doServico("RELATORIOSITFIS92")[0].corpo).pedidoDados.dados)).toEqual({ protocoloRelatorio: "PROTOCOLO-FICTICIO-DO-SITFIS" });
    const [guardado] = m.guardarArquivo.mock.calls[0];
    expect(guardado.folderId).toBe("pasta-fiscal");
    expect(guardado.arquivo.name).toBe("Situação fiscal - Empresa Fictícia Ltda - 2026-10-20.pdf");
    expect(guardado.arquivo.type).toBe("application/pdf");
    expect(pedidos()[0]).toMatchObject({ situacao: "PRONTO", driveFileId: "arquivo-1" });
    // O protocolo é grátis (Apoiar); o relatório é uma emissão.
    expect(m.banco.estado.chamadas.map((c) => [c.idServico, c.cobrada])).toEqual([
      ["SOLICITARPROTOCOLO91", false],
      ["RELATORIOSITFIS92", true],
    ]);
    // Na tela, a pessoa já viu: sem aviso no sino.
    expect(m.notifyUser).not.toHaveBeenCalled();
  });

  it("sem a autorização 00002, nem o protocolo é pedido", async () => {
    m.banco.estado.autorizacoes.set("11444777", { ...ativa, allServices: false, services: "00146" });
    const t = transportePorServico({});
    const r = await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/não inclui o serviço 00002/) });
    expect(t.chamadas()).toHaveLength(0);
    expect(pedidos()).toHaveLength(0);
  });

  it("sem onde guardar (Arquivos desligados ou sem pasta Fiscal), não se paga o relatório", async () => {
    const t = transportePorServico({});
    m.isModuleEnabled.mockResolvedValueOnce(false);
    expect(await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte))).toMatchObject({ ok: false, erro: expect.stringMatching(/Arquivos estão desligados/) });
    m.banco.tabelas.driveFolder.zerar();
    expect(await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte))).toMatchObject({ ok: false, erro: expect.stringMatching(/não tem a pasta Fiscal/) });
    expect(t.chamadas()).toHaveLength(0);
  });

  it("já pedido hoje: não pede de novo", async () => {
    const t = transportePorServico({ SOLICITARPROTOCOLO91: () => PROTOCOLO_DO_SITFIS, RELATORIOSITFIS92: () => RELATORIO_DO_SITFIS });
    await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));
    const r = await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));
    expect(r).toEqual({ ok: true, texto: "A situação fiscal de hoje já está nos Arquivos › Fiscal.", pronto: true });
    expect(t.chamadas()).toHaveLength(2);
  });

  it("espera longa: a tela não espera, e o agendador emite só depois do tempo", async () => {
    const longa = { status: 200, corpo: JSON.stringify({ dados: JSON.stringify({ protocoloRelatorio: "P-LONGO", tempoEspera: 60000 }), mensagens: [] }) };
    const t = transportePorServico({ SOLICITARPROTOCOLO91: () => longa, RELATORIOSITFIS92: () => RELATORIO_DO_SITFIS });
    const r = await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));
    expect(r).toMatchObject({ ok: true, pronto: false });
    expect(esperas).toEqual([]);
    expect(pedidos()[0]).toMatchObject({ situacao: "RESULTADO", protocolo: "P-LONGO" });

    // 30 s depois: ainda cedo — nada sai.
    relogio = new Date(relogio.getTime() + 30_000);
    expect(await processarPedidosDoSitfis(TENANT, opcoes(t.transporte))).toBe(0);
    expect(t.doServico("RELATORIOSITFIS92")).toHaveLength(0);

    // Passado o tempo (60 s + 2 s de folga): emite, guarda e avisa quem pediu.
    relogio = new Date(relogio.getTime() + 33_000);
    expect(await processarPedidosDoSitfis(TENANT, opcoes(t.transporte))).toBe(1);
    expect(pedidos()[0]).toMatchObject({ situacao: "PRONTO" });
    expect(m.notifyUser).toHaveBeenCalledWith("kauan", expect.objectContaining({ type: "SERPRO_SITFIS", entityType: "COMPANY", entityId: EMPRESA.id }));
  });

  it("204: o novo tempo vem do ETag, e o agendador volta depois dele", async () => {
    const t = transportePorServico({
      SOLICITARPROTOCOLO91: () => PROTOCOLO_DO_SITFIS,
      RELATORIOSITFIS92: (n) => (n === 0 ? { status: 204, cabecalhos: { etag: '"tempoEspera:20000"' } } : RELATORIO_DO_SITFIS),
    });
    expect(await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte))).toMatchObject({ ok: true, pronto: false });
    const proxima = (pedidos()[0].proximaTentativa as Date).getTime() - relogio.getTime();
    expect(proxima).toBe(22_000);
    relogio = new Date(relogio.getTime() + 22_000);
    await processarPedidosDoSitfis(TENANT, opcoes(t.transporte));
    expect(pedidos()[0]).toMatchObject({ situacao: "PRONTO" });
    // O 204 não é cobrado; só o 200 do relatório.
    expect(m.banco.estado.chamadas.filter((c) => c.cobrada)).toHaveLength(1);
  });

  it("o protocolo vence no fim do dia: o pedido de ontem expira e avisa", async () => {
    const longa = { status: 200, corpo: JSON.stringify({ dados: JSON.stringify({ protocoloRelatorio: "P", tempoEspera: 60000 }), mensagens: [] }) };
    const t = transportePorServico({ SOLICITARPROTOCOLO91: () => longa, RELATORIOSITFIS92: () => RELATORIO_DO_SITFIS });
    await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));
    relogio = new Date("2026-10-21T08:00:00-03:00");
    await processarPedidosDoSitfis(TENANT, opcoes(t.transporte));
    expect(pedidos()[0]).toMatchObject({ situacao: "EXPIRADO" });
    expect(t.doServico("RELATORIOSITFIS92")).toHaveLength(0);
    expect(m.notifyUser).toHaveBeenCalledWith("kauan", expect.objectContaining({ message: expect.stringMatching(/não ficou pronta no dia/) }));
  });

  it("dois ciclos ao mesmo tempo: o relatório sai (e é pago) uma vez só", async () => {
    const longa = { status: 200, corpo: JSON.stringify({ dados: JSON.stringify({ protocoloRelatorio: "P", tempoEspera: 60000 }), mensagens: [] }) };
    const t = transportePorServico({ SOLICITARPROTOCOLO91: () => longa, RELATORIOSITFIS92: () => RELATORIO_DO_SITFIS });
    await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte));
    relogio = new Date(relogio.getTime() + 70_000);
    const feitos = await Promise.all([processarPedidosDoSitfis(TENANT, opcoes(t.transporte)), processarPedidosDoSitfis(TENANT, opcoes(t.transporte))]);
    expect(feitos.sort()).toEqual([0, 1]);
    expect(t.doServico("RELATORIOSITFIS92")).toHaveLength(1);
  });

  it("na demonstração, o relatório de um cliente não é pedido", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" });
    const t = transportePorServico({});
    expect(await pedirSituacaoFiscal(TENANT, "kauan", EMPRESA.id, opcoes(t.transporte))).toMatchObject({ ok: false, erro: expect.stringMatching(/demonstração/) });
    expect(await processarPedidosDoSitfis(TENANT, opcoes(t.transporte))).toBe(0);
    vi.unstubAllEnvs();
  });
});
