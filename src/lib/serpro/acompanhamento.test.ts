import { beforeEach, describe, expect, it, vi } from "vitest";
import { configDeProducao, corpoDoSerpro, TENANT, transportePorServico } from "./teste.fixture";
import { DETALHE_DA_CAIXA_POSTAL, INDICADOR_DA_CAIXA_POSTAL, LISTA_DA_CAIXA_POSTAL, MATRIZ_DE_EVENTOS, SOLICITACAO_DE_EVENTOS } from "./receita.fixture";

// O acompanhamento da carteira (Fase 1, 20/10/2026): os Eventos de
// Atualização do dia e a Caixa Postal que reage ao E0601. O `chamarSerpro` é o
// de verdade, com transporte falso; a carteira tem os quatro CNPJs do cenário
// dos eventos (o terceiro tem evento; o quarto, "x", não tem autorização).

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("./teste.fixture");
  return { banco: bancoFalso(), notifySector: vi.fn(), logAudit: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco.prisma }));
vi.mock("@/lib/integracoes/data", () => ({
  lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}),
  executar: async (_p: unknown, corpo: () => Promise<{ resultado: unknown }>) => (await corpo()).resultado,
}));
vi.mock("@/lib/notifications", () => ({ notifySector: m.notifySector, notifyUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
const DOCUMENTOS = ["00000000000000", "11111111111111", "22222222222222", "33333333333333"];
vi.mock("@/lib/autorizacoes/servidor", () => ({
  carteiraDasAutorizacoes: async () => ({ linhas: DOCUMENTOS.map((d) => ({ chave: d.slice(0, 8), situacao: "falta_pedir" })) }),
  representantesDasChaves: async () => new Map(DOCUMENTOS.map((d) => [d.slice(0, 8), { id: `empresa-${d.slice(0, 8)}`, nome: `Empresa ${d.slice(0, 4)}`, documento: d }])),
  setorDasAutorizacoes: async () => "fiscal",
}));

const { chamarSerpro, esquecerTokens } = await import("./cliente");
const { abrirMensagem, acompanharNoSerpro } = await import("./acompanhamento");
const { pedidoDoDetalhe } = await import("./caixaPostal");

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
/** O roteiro de um dia comum: os eventos do cenário e a Caixa Postal com mensagens novas. */
const dia = (extra: Parameters<typeof transportePorServico>[0] = {}) =>
  transportePorServico({
    SOLICEVENTOSPJ132: () => SOLICITACAO_DE_EVENTOS,
    OBTEREVENTOSPJ134: () => MATRIZ_DE_EVENTOS,
    INNOVAMSG63: () => INDICADOR_DA_CAIXA_POSTAL,
    MSGCONTRIBUINTE61: () => LISTA_DA_CAIXA_POSTAL,
    ...extra,
  });
const eventos = () => m.banco.tabelas.serproEvento.linhas;
const mensagens = () => m.banco.tabelas.serproMensagem.linhas;

beforeEach(() => {
  m.banco.zerar();
  esquecerTokens();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  relogio = new Date("2026-10-20T10:00:00-03:00");
  esperas.length = 0;
  m.banco.conectar(configDeProducao());
  // A Caixa Postal (00006) dos dois com evento está autorizada.
  m.banco.estado.autorizacoes.set("11111111", ativa);
  m.banco.estado.autorizacoes.set("22222222", ativa);
});

describe("os Eventos de Atualização do dia", () => {
  it("pede os três eventos em lote, espera, lê a matriz e marca quem não tem acesso", async () => {
    const t = dia();
    expect(await acompanharNoSerpro(TENANT, opcoes(t.transporte))).toBe(3 + 3 + 2);

    const pedidos = t.doServico("SOLICEVENTOSPJ132").map((c) => JSON.parse(c.corpo));
    expect(pedidos.map((p) => JSON.parse(p.pedidoDados.dados).evento)).toEqual(["E0301", "E0601", "E0701"]);
    expect(pedidos[0].contribuinte).toEqual({ numero: DOCUMENTOS.join(","), tipo: 4 });
    // A espera do Serpro (o mínimo de 3 s) com a folga de 2 s, uma vez para os três.
    expect(esperas).toEqual([5000]);
    expect(t.doServico("OBTEREVENTOSPJ134")).toHaveLength(3);

    expect(eventos()).toHaveLength(12);
    const de = (chave: string, evento: string) => eventos().find((e) => e.chave === chave && e.evento === evento)!;
    expect(de("11111111", "E0701")).toMatchObject({ ultimoEm: new Date("2023-03-27T12:00:00Z"), semAcesso: false, pendente: false });
    expect(de("33333333", "E0301")).toMatchObject({ semAcesso: true, ultimoEm: null });
    expect(de("00000000", "E0601")).toMatchObject({ ultimoEm: null, pendente: false });
    // Os eventos são de graça.
    expect(m.banco.estado.chamadas.filter((c) => c.idServico.includes("EVENTOS")).every((c) => !c.cobrada)).toBe(true);
    expect(m.banco.estado.chamadas.find((c) => c.idServico === "SOLICEVENTOSPJ132")).toMatchObject({ contribuinte: "lote:4" });
  });

  it("uma vez por dia, e só depois das 7h", async () => {
    relogio = new Date("2026-10-20T06:30:00-03:00");
    const t = dia();
    expect(await acompanharNoSerpro(TENANT, opcoes(t.transporte))).toBe(0);
    expect(t.chamadas()).toHaveLength(0);

    relogio = new Date("2026-10-20T07:05:00-03:00");
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    relogio = new Date("2026-10-20T07:15:00-03:00");
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("SOLICEVENTOSPJ132")).toHaveLength(3);
  });

  it("o resultado fica no Serpro só 20 minutos; o 202 tenta de novo no próximo ciclo", async () => {
    const t = dia({ OBTEREVENTOSPJ134: (n) => (n < 3 ? { status: 202, corpo: "" } : MATRIZ_DE_EVENTOS) });
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(m.banco.tabelas.serproPedido.linhas.every((p) => p.situacao === "RESULTADO")).toBe(true);
    expect(eventos()).toHaveLength(0);

    // Dez minutos depois, a matriz está pronta.
    relogio = new Date(relogio.getTime() + 10 * 60_000);
    for (const p of m.banco.tabelas.serproPedido.linhas) p.proximaTentativa = relogio;
    for (const p of m.banco.tabelas.serproPedido.linhas) p.createdAt = new Date(relogio.getTime() - 10 * 60_000);
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(eventos()).toHaveLength(12);

    // Um pedido de 25 minutos atrás já não tem resultado: expira sem chamar.
    m.banco.tabelas.serproPedido.linhas.push({ id: "velho", tenantId: TENANT, tipo: "EVENTOS:E0301:PJ", contribuinte: "lote:4", protocolo: "p", situacao: "RESULTADO", proximaTentativa: relogio, dia: "2026-10-20", tentativas: 0, createdAt: new Date(relogio.getTime() - 25 * 60_000) });
    const antes = t.doServico("OBTEREVENTOSPJ134").length;
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(m.banco.tabelas.serproPedido.linhas.find((p) => p.id === "velho")).toMatchObject({ situacao: "EXPIRADO" });
    expect(t.doServico("OBTEREVENTOSPJ134")).toHaveLength(antes);
  });
});

describe("a Caixa Postal, a partir do evento de mensagem nova", () => {
  it("o indicador (grátis) confirma, a lista (paga) traz o que chegou, e o setor é avisado uma vez", async () => {
    const t = dia();
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("INNOVAMSG63")).toHaveLength(2);
    expect(t.doServico("MSGCONTRIBUINTE61")).toHaveLength(2);
    expect(mensagens()).toHaveLength(6);
    // O evento mais recente primeiro (o 22222222 é de 28/03, o 11111111 de 27/03).
    expect(t.doServico("MSGCONTRIBUINTE61").map((c) => JSON.parse(c.corpo).contribuinte.numero)).toEqual(["22222222222222", "11111111111111"]);
    expect(mensagens().find((x) => x.chave === "11111111" && x.isn === "0001493189")).toMatchObject({ abertaEm: null, corpo: null, relevante: false });
    expect(m.notifySector).toHaveBeenCalledTimes(2);
    expect(m.notifySector).toHaveBeenCalledWith(
      "fiscal",
      expect.objectContaining({ type: "SERPRO_CAIXA_POSTAL", entityType: "COMPANY", entityId: "empresa-11111111", message: expect.stringMatching(/^Caixa Postal da Receita: 3 mensagens novas de Empresa 1111 \(2 relevantes\)/) })
    );
    // A lista é uma consulta cobrada; o indicador, não.
    expect(m.banco.estado.chamadas.filter((c) => c.idServico === "MSGCONTRIBUINTE61").every((c) => c.cobrada)).toBe(true);
    expect(m.banco.estado.chamadas.filter((c) => c.idServico === "INNOVAMSG63").every((c) => !c.cobrada)).toBe(true);
    expect(eventos().filter((e) => e.pendente)).toHaveLength(0);

    // A mesma lista de novo (outro evento novo, as mesmas mensagens): ninguém é avisado de novo.
    vi.clearAllMocks();
    for (const e of eventos().filter((x) => x.evento === "E0601" && x.ultimoEm)) e.pendente = true;
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(mensagens()).toHaveLength(6);
    expect(m.notifySector).not.toHaveBeenCalled();
  });

  it("o indicador diz que não há nova: a lista não é paga", async () => {
    const t = dia({ INNOVAMSG63: () => ({ status: 200, corpo: corpoDoSerpro({ codigo: "00", conteudo: [{ indicadorMensagensNovas: "0" }] }) }) });
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("INNOVAMSG63")).toHaveLength(2);
    expect(t.doServico("MSGCONTRIBUINTE61")).toHaveLength(0);
  });

  it("sem a autorização 00006: o portão barra a lista, e o ciclo segue", async () => {
    m.banco.estado.autorizacoes.clear();
    const t = dia();
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("INNOVAMSG63")).toHaveLength(2);
    expect(t.doServico("MSGCONTRIBUINTE61")).toHaveLength(0);
    expect(eventos().filter((e) => e.pendente)).toHaveLength(0);
  });

  it("403 é do cliente (falta autorização): o ciclo segue para o próximo", async () => {
    const t = dia({ INNOVAMSG63: (n) => (n === 0 ? { status: 403, corpo: JSON.stringify({ mensagens: [{ codigo: "[AcessoNegado-ICGERENCIADOR-022]", texto: "" }] }) } : INDICADOR_DA_CAIXA_POSTAL) });
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("INNOVAMSG63")).toHaveLength(2);
    expect(t.doServico("MSGCONTRIBUINTE61")).toHaveLength(1);
  });

  it("429 (cota): o cliente volta para a fila e o ciclo para ali", async () => {
    const t = dia({ INNOVAMSG63: () => ({ status: 429 }) });
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("INNOVAMSG63")).toHaveLength(1);
    expect(eventos().filter((e) => e.evento === "E0601" && e.pendente)).toHaveLength(2);
  });

  it("teto atingido: a lista espera, sem pagar", async () => {
    m.banco.conectar({ ...configDeProducao(), tetoMensal: "0,24" });
    m.banco.estado.chamadas.push({ tenantId: TENANT, caminho: "Consultar", idSistema: "PROCURACOES", idServico: "OBTERPROCURACAO41", contribuinte: "1", httpStatus: 200, cobrada: true, tipoDeCobranca: "CONSULTA", mensagens: null, ambiente: "PRODUCAO", requestTag: null, origem: "teste", createdAt: new Date() });
    const t = dia();
    await acompanharNoSerpro(TENANT, opcoes(t.transporte));
    expect(t.doServico("MSGCONTRIBUINTE61")).toHaveLength(0);
    expect(eventos().filter((e) => e.evento === "E0601" && e.pendente)).toHaveLength(2);
  });

  it("na demonstração, nada roda", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" });
    const t = dia();
    expect(await acompanharNoSerpro(TENANT, opcoes(t.transporte))).toBe(0);
    expect(t.chamadas()).toHaveLength(0);
  });
});

describe("abrir uma mensagem (dá ciência da intimação)", () => {
  const guardada = () => {
    m.banco.tabelas.serproMensagem.linhas.push({
      id: "msg-1",
      tenantId: TENANT,
      chave: "11111111",
      documento: "11111111111111",
      isn: "0000082838",
      assunto: "Dossiê de atendimento",
      enviadaEm: new Date("2026-10-19T10:00:00-03:00"),
      relevante: true,
      abertaEm: null,
      abertaPorId: null,
      corpo: null,
      cienciaEm: null,
    });
    m.banco.tabelas.user.linhas.push({ id: "coord", name: "Coordenação Fiscal" });
  };

  it("abre uma vez, grava quem abriu e o corpo; a segunda vez lê do banco", async () => {
    guardada();
    const t = transportePorServico({ MSGDETALHAMENTO62: () => DETALHE_DA_CAIXA_POSTAL });
    const r = await abrirMensagem(TENANT, "coord", "msg-1", { transporte: t.transporte });
    expect(r).toMatchObject({ ok: true, mensagem: { assunto: "Dossiê de atendimento", abertaPor: "Coordenação Fiscal" } });
    expect(r.ok && r.mensagem.corpo).toContain("Chat RFB");
    expect(mensagens()[0]).toMatchObject({ abertaPorId: "coord", lidaNoSerpro: true });
    expect(mensagens()[0].abertaEm).toBeInstanceOf(Date);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "autorizacoes.serpro_caixa_postal", entityId: "msg-1", userId: "coord" }));
    // O detalhe é uma consulta cobrada.
    expect(m.banco.estado.chamadas.find((c) => c.idServico === "MSGDETALHAMENTO62")).toMatchObject({ cobrada: true, userId: "coord" });

    const de_novo = await abrirMensagem(TENANT, "coord", "msg-1", { transporte: t.transporte });
    expect(de_novo.ok).toBe(true);
    expect(t.doServico("MSGDETALHAMENTO62")).toHaveLength(1);
  });

  it("sem a confirmação da pessoa, o detalhe não é chamado — o agendador nunca abre", async () => {
    const t = transportePorServico({ MSGDETALHAMENTO62: () => DETALHE_DA_CAIXA_POSTAL });
    const r = await chamarSerpro(TENANT, pedidoDoDetalhe("11111111111111", "0000082838"), { origem: "agendador", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "precisa_de_pessoa" });
    expect(t.chamadas()).toHaveLength(0);
  });
});
