import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "ADMIN" },
  pode: vi.fn(),
  audit: vi.fn(),
  revalidar: vi.fn(),
  motor: null as unknown as { escrita: boolean; raizes: string[]; cliente: ReturnType<typeof import("@/lib/sped/motor").criarClienteDoMotor> },
  estabs: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, podeExcluir: () => true }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidar }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => m.motor,
  atorDaSessao: async () => ({ id: "usr_teste", nome: "Kátia Souza", email: "katia@41contabil.com.br", tenant: "ten_teste" }),
  estabelecimentosDaRaiz: m.estabs,
}));
const { criarClienteDoMotor } = await import("@/lib/sped/motor");
const acoes = await import("./escritas-actions");

const DIR = path.resolve(__dirname, "../../../../tests/fixtures/connect_v1/escritas");
const fixture = (nome: string) => JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8")) as { resposta: { status: number; corpo: unknown; x_custo?: string; retry_after?: string } };
const R = "17122471";
const CHAVE = "c41:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ESTABS = [
  { id: 1, cnpj: "17122471001147", matriz: false, companyId: "c1", companyNome: "BLD SP", ativo: true },
];

/** O motor responde com a fixture; o cliente é o de verdade. */
type Resposta = { status: number; corpo: unknown; x_custo?: string; retry_after?: string };
function responder(...nomes: (string | Resposta)[]) {
  for (const n of nomes) {
    const r: Resposta = typeof n === "string" ? fixture(n).resposta : n;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (r.x_custo) headers["X-Custo"] = r.x_custo;
    if (r.retry_after) headers["Retry-After"] = r.retry_after;
    m.fetch.mockImplementationOnce(async () => new Response(JSON.stringify(r.corpo), { status: r.status, headers }));
  }
}
const ARQUIVO_103 = { id: 103, obrigacao: "icms_ipi", cnpj: "17122471001147", empresa_id: 1, competencia: "2032-03", data_ini: "2032-03-01", data_fim: "2032-03-31", versao: 1, considerado: true, superado_por: null, gerado_em: "2026-10-23T14:00:00+00:00", nome_arquivo: "x.txt", validacao: { estado: "nao_validado" }, entrega: { estado: "nao_registrada" }, defasado: false };
const enviado = (i = 0) => ({ url: String(m.fetch.mock.calls[i][0]), init: m.fetch.mock.calls[i][1] as RequestInit });

beforeEach(() => {
  vi.clearAllMocks();
  m.fetch.mockReset();
  m.ctx = { tenantId: "t1", userId: "u1", role: "ADMIN" };
  m.pode.mockResolvedValue(true);
  m.estabs.mockResolvedValue({ visiveis: ESTABS, semCadastro: [], semMotor: [] });
  m.motor = { escrita: true, raizes: [R], cliente: criarClienteDoMotor({ baseUrl: "https://motor", token: "t-leitura", tokenEscrita: "t-escrita" }, { fetch: m.fetch as never, esperar: async () => {} }) };
});

describe("portão comum: perfil, raiz e token de escrita", () => {
  const chamadas: [string, () => Promise<{ ok: boolean; codigo?: string | null }>, string][] = [
    ["cobertura", () => acoes.apurarCoberturaNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-02", chave: CHAVE }), "fiscal_acervo"],
    ["quarentena", () => acoes.resolverRejeitadoNoMotor({ raiz: R, id: 109, resolvido: true, observacao: "" }), "fiscal_acervo"],
    ["decidir pagamento", () => acoes.decidirPagamentoNoMotor({ raiz: R, caminho: "a.pdf", pagina: 1, ordem: 1, decisao: "aceito", motivo: "" }), "fiscal_contribuicoes"],
    ["corrigir pagamento", () => acoes.corrigirPagamentoNoMotor({ raiz: R, caminho: "a.pdf", pagina: 1, ordem: 1, valor: "1.00" }), "fiscal_contribuicoes"],
    ["contrato", () => acoes.informarContratoNoMotor({ raiz: R, fornecedor: "X" }), "fiscal_contribuicoes"],
    ["CT-e", () => acoes.apurarCteNoMotor({ raiz: R, id: 103, tela: "conferencia" }), "fiscal_conferencia"],
    ["simulação", () => acoes.gravarSimulacaoNoMotor({ raiz: R, competencia: "2032-03", linha: "rpas", valor: "1.00" }), "fiscal_conferencia"],
    ["combustível", () => acoes.apurarCombustivelNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-03" }), "fiscal_conferencia"],
    ["documento do Omie", () => acoes.decidirDocumentoDaConferenciaNoMotor({ raiz: R, id: 130, decisao: "aceito" }), "fiscal_conferencia"],
  ];
  it.each(chamadas)("%s: sem agir no módulo da tela, nem chama o motor", async (_n, chamar, modulo) => {
    m.pode.mockResolvedValue(false);
    expect((await chamar()).ok).toBe(false);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, modulo, "agir");
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each(chamadas)("%s: sem token de escrita, recusa com o código e não chama", async (_n, chamar) => {
    m.motor.escrita = false;
    expect(await chamar()).toMatchObject({ ok: false, codigo: "escrita_nao_habilitada" });
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("raiz fora do alcance da equipe: recusa sem chamar", async () => {
    expect((await acoes.resolverRejeitadoNoMotor({ raiz: "99999999", id: 109, resolvido: true, observacao: "" })).ok).toBe(false);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});

describe("Documentos", () => {
  it("apurar cobertura: 202 vira a execução, audita, relê Documentos e a fila", async () => {
    responder("cobertura_apurar");
    const r = await acoes.apurarCoberturaNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-02", chave: CHAVE });
    expect(r).toMatchObject({ ok: true, dados: { id: 38, acao: "cobertura" } });
    expect((enviado().init.headers as Record<string, string>)["Idempotency-Key"]).toBe(CHAVE);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.cobertura.apurada", entityType: "SpedExecucao", entityId: "38" }));
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/documentos", "/fiscal/operacao"]);
  });
  it("estabelecimento que a pessoa não vê: recusa sem chamar", async () => {
    expect((await acoes.apurarCoberturaNoMotor({ raiz: R, estabelecimentoId: 77, competencia: "2032-02", chave: CHAVE })).ok).toBe(false);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("409 cobertura_em_andamento: a frase do motor, chave nova, sem auditoria nem releitura", async () => {
    responder("erro_cobertura_em_andamento");
    const r = await acoes.apurarCoberturaNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-01", chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "cobertura_em_andamento", mensagem: "essa competência já está sendo apurada.", renovarChave: true });
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.revalidar).not.toHaveBeenCalled();
  });
  it("409 execucao_duplicada devolve o existente para a tela oferecer 'pedir de novo'", async () => {
    responder("erro_execucao_duplicada");
    const r = await acoes.apurarCoberturaNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-02", chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "execucao_duplicada", detalhe: { existente: { id: 38 } } });
  });
  it("sem chave a apuração nem é validada", async () => {
    expect((await acoes.apurarCoberturaNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-02" })).ok).toBe(false);
    expect(m.pode).not.toHaveBeenCalled();
  });
  it("resolver na quarentena: audita a baixa e relê só Documentos; reabrir é outra ação", async () => {
    responder("quarentena_resolver");
    const r = await acoes.resolverRejeitadoNoMotor({ raiz: R, id: 109, resolvido: true, observacao: "evento, não documento" });
    expect(r).toMatchObject({ ok: true, dados: { id: 109, resolvido: true } });
    expect(JSON.parse(enviado().init.body as string)).toEqual({ resolvido: true, observacao: "evento, não documento" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.quarentena.resolvida", entityId: "109" }));
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/documentos"]);
    responder({ status: 200, corpo: { ...(fixture("quarentena_resolver").resposta.corpo as object), resolvido: false }, x_custo: "leve" });
    await acoes.resolverRejeitadoNoMotor({ raiz: R, id: 109, resolvido: false, observacao: "" });
    expect(m.audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "fiscal.sped.quarentena.reaberta" }));
  });
  it("404 do motor vira a mensagem do Connect", async () => {
    responder("erro_quarentena_nao_encontrado");
    const r = await acoes.resolverRejeitadoNoMotor({ raiz: R, id: 999999999, resolvido: true, observacao: "" });
    expect(r).toMatchObject({ ok: false, codigo: "nao_encontrado" });
  });
});

describe("PIS e COFINS › Fechamento", () => {
  it("decidir pagamento: corpo sem autor, audita com os registros e relê a tela", async () => {
    responder("pagamento_decidir");
    const r = await acoes.decidirPagamentoNoMotor({ raiz: R, caminho: "TESTE-TELAS/rpa.pdf", pagina: 1, ordem: 1, decisao: "descartado", motivo: "duplicado da página 2" });
    expect(r.ok).toBe(true);
    expect(JSON.parse(enviado().init.body as string)).toEqual({ caminho: "TESTE-TELAS/rpa.pdf", pagina: 1, ordem: 1, decisao: "descartado", motivo: "duplicado da página 2" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.pagamento.decidido", entityType: "SpedPagamento", metadata: expect.objectContaining({ registroIds: [282] }) }));
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/contribuicoes"]);
  });
  it("422 pagamento_nao_aceitavel no decidir: a frase do motor, sem auditoria", async () => {
    responder("erro_pagamento_nao_aceitavel");
    const r = await acoes.decidirPagamentoNoMotor({ raiz: R, caminho: "TESTE-TELAS/recibo_sem_competencia.pdf", pagina: 1, ordem: 1, decisao: "aceito", motivo: "" });
    expect(r).toMatchObject({ ok: false, codigo: "pagamento_nao_aceitavel" });
    expect(r.mensagem).toMatch(/^não dá para aceitar/);
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("corrigir manda só os campos mexidos, com dinheiro em string, e \"\" limpa", async () => {
    responder("pagamento_corrigir");
    await acoes.corrigirPagamentoNoMotor({ raiz: R, caminho: "TESTE-TELAS/rpa.pdf", pagina: 4, ordem: 1, valor: "55.50", documento: "98765432100", nome: "", motivo: "conferi o PDF" });
    expect(JSON.parse(enviado().init.body as string)).toEqual({ caminho: "TESTE-TELAS/rpa.pdf", pagina: 4, ordem: 1, valor: "55.50", documento: "98765432100", nome: "", motivo: "conferi o PDF" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.pagamento.corrigido" }));
  });
  it("corrigir sem campo, com valor numérico ou documento errado: recusa antes do motor", async () => {
    expect((await acoes.corrigirPagamentoNoMotor({ raiz: R, caminho: "a", pagina: 1, ordem: 1 })).ok).toBe(false);
    expect(await acoes.corrigirPagamentoNoMotor({ raiz: R, caminho: "a", pagina: 1, ordem: 1, valor: 55.5 })).toMatchObject({ ok: false, campos: { valor: expect.any(String) } });
    expect(await acoes.corrigirPagamentoNoMotor({ raiz: R, caminho: "a", pagina: 1, ordem: 1, documento: "123" })).toMatchObject({ ok: false, campos: { documento: expect.any(String) } });
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("corrigir e aceitar com o aceite recusado: a correção fica — a tela diz, audita e relê", async () => {
    responder("erro_pagamento_corrigir_aceite_recusado");
    const r = await acoes.corrigirPagamentoNoMotor({ raiz: R, caminho: "TESTE-TELAS/recibo_sem_competencia.pdf", pagina: 1, ordem: 1, valor: "12.00", decisao: "aceito" });
    expect(r).toMatchObject({ ok: false, codigo: "pagamento_nao_aceitavel", detalhe: { correcaoGravada: true, registro_ids: [284] } });
    expect(r.mensagem).toMatch(/^A correção foi gravada, mas o aceite foi recusado: não dá para aceitar/);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.pagamento.corrigido", metadata: expect.objectContaining({ aceiteRecusado: true, registroIds: [284] }) }));
    expect(m.revalidar).toHaveBeenCalledWith("/fiscal/contribuicoes");
  });
  it("informar contrato: só o preenchido vai; a tratativa é exigida na ressalva", async () => {
    responder("contrato_informar");
    const r = await acoes.informarContratoNoMotor({ raiz: R, fornecedor: "FORNECEDOR TESTE ESCRITAS", locador_documento: "11222333000181", vigencia_inicio: "2032-01-01", vigencia_fim: "2032-12-31", onde_esta: "" });
    expect(r.ok).toBe(true);
    expect(JSON.parse(enviado().init.body as string)).toEqual({ fornecedor: "FORNECEDOR TESTE ESCRITAS", locador_documento: "11222333000181", vigencia_inicio: "2032-01-01", vigencia_fim: "2032-12-31" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.contrato.informado", entityId: "FORNECEDOR TESTE ESCRITAS" }));
    const sem = await acoes.informarContratoNoMotor({ raiz: R, fornecedor: "X", aprovado_fora_da_regra: "S" });
    expect(sem).toMatchObject({ ok: false, campos: { tratativa: expect.any(String) } });
  });
  it("apurar CT-e: confere o arquivo (estabelecimento visível, ICMS/IPI), relê Fechamento e Prévia", async () => {
    responder({ status: 200, corpo: ARQUIVO_103 }, "arquivo_apurar_cte");
    const r = await acoes.apurarCteNoMotor({ raiz: R, id: 103, tela: "contribuicoes", chave: CHAVE });
    expect(r).toMatchObject({ ok: true, dados: { qtd_cte: 3, valor_total: "10416.67" } });
    expect(enviado(1).url).toBe("https://motor/api/connect/v1/arquivos/103/apurar-cte?cnpj_raiz=17122471");
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_contribuicoes", "agir");
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/contribuicoes", "/fiscal/conferencia"]);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.cte.apurado", entityId: "103" }));
  });
  it("apurar CT-e de arquivo de outro estabelecimento ou de Contribuições: recusa sem apurar", async () => {
    responder({ status: 200, corpo: { ...ARQUIVO_103, cnpj: "99999999000199" } });
    expect((await acoes.apurarCteNoMotor({ raiz: R, id: 103, tela: "contribuicoes" })).ok).toBe(false);
    responder({ status: 200, corpo: { ...ARQUIVO_103, obrigacao: "contribuicoes" } });
    expect(await acoes.apurarCteNoMotor({ raiz: R, id: 103, tela: "contribuicoes" })).toMatchObject({ ok: false, codigo: "obrigacao_incompativel" });
    expect(m.fetch).toHaveBeenCalledTimes(2);
  });
  it("503 motor_ocupado no CT-e: mensagem amigável, uma chamada só, a mesma chave serve na nova tentativa", async () => {
    responder({ status: 200, corpo: ARQUIVO_103 }, "erro_motor_ocupado");
    const r = await acoes.apurarCteNoMotor({ raiz: R, id: 103, tela: "conferencia", chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "motor_ocupado", renovarChave: false });
    expect(r.mensagem).toMatch(/tente em alguns segundos \(cerca de 5 s\)/);
    expect(m.fetch).toHaveBeenCalledTimes(2);
    expect(m.revalidar).not.toHaveBeenCalled();
  });
});

describe("Conferência", () => {
  it("simulação devolve a prévia recalculada e relê a Conferência", async () => {
    responder("simulacao");
    const r = await acoes.gravarSimulacaoNoMotor({ raiz: R, competencia: "2032-03", linha: "rpas", valor: "1234.56", observacao: "RPA de março" });
    expect(r).toMatchObject({ ok: true, dados: { competencia: "2032-03", totais: { a_pagar: "541.81" } } });
    expect(JSON.parse(enviado().init.body as string)).toEqual({ competencia: "2032-03", linha: "rpas", valor: "1234.56", observacao: "RPA de março" });
    expect(enviado().init.method).toBe("PUT");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.simulacao.gravada" }));
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/conferencia"]);
  });
  it("simulação com valor null apaga a linha (não é zero)", async () => {
    responder("simulacao");
    await acoes.gravarSimulacaoNoMotor({ raiz: R, competencia: "2032-03", linha: "rpas", valor: null });
    expect(JSON.parse(enviado().init.body as string)).toEqual({ competencia: "2032-03", linha: "rpas", valor: null });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.simulacao.apagada" }));
  });
  it("simulação de linha que o motor não simula: 422 com a lista dele", async () => {
    responder("erro_simulacao_linha");
    const r = await acoes.gravarSimulacaoNoMotor({ raiz: R, competencia: "2032-03", linha: "xyz", valor: "1.00" });
    expect(r).toMatchObject({ ok: false, codigo: "parametro_invalido", campos: { linha: expect.stringMatching(/Simuláveis: rpas, credito_mes_anterior/) } });
  });
  it("combustível de uma filial visível: pesada, audita e relê", async () => {
    responder("combustivel_apurar");
    const r = await acoes.apurarCombustivelNoMotor({ raiz: R, estabelecimentoId: 1, competencia: "2032-03" });
    expect(r).toMatchObject({ ok: true, dados: { valor_ambos: "0.00", notas_lidas: 0 } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.combustivel.apurado", entityId: "1|2032-03" }));
    expect((await acoes.apurarCombustivelNoMotor({ raiz: R, estabelecimentoId: 77, competencia: "2032-03" })).ok).toBe(false);
  });
  it("decidir documento do Omie: chave de 44 dígitos opcional, conferida antes", async () => {
    responder("conferencia_documento_decidir");
    const r = await acoes.decidirDocumentoDaConferenciaNoMotor({ raiz: R, id: 130, decisao: "corrigido", observacao: "é a nota 1", chaveDaNota: "1".repeat(44) });
    expect(r).toMatchObject({ ok: true, dados: { id: 130, decisao: "corrigido" } });
    expect(JSON.parse(enviado().init.body as string)).toEqual({ decisao: "corrigido", observacao: "é a nota 1", chave: "1".repeat(44) });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.conferencia.decidida", entityId: "130" }));
    expect((await acoes.decidirDocumentoDaConferenciaNoMotor({ raiz: R, id: 130, decisao: "corrigido", chaveDaNota: "123" })).ok).toBe(false);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Conferência › prestadores: regime MEI/normal (§14.1)", () => {
  const CNPJ = "11222333000181";
  it("corrige neste cliente: PUT com a competência da tela, sem campo de autor; audita e relê a Conferência", async () => {
    responder("regime_definir");
    const r = await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: CNPJ, regime: "mei", competencia: "2032-03", chave: CHAVE });
    expect(r).toMatchObject({ ok: true, dados: { prestador: { regime: "mei", origem: "cliente" } } });
    expect(r.mensagem).toMatch(/passa a MEI neste cliente/);
    const { url, init } = enviado();
    expect([init.method, url]).toEqual(["PUT", "https://motor/api/connect/v1/conferencia/prestadores/regime?cnpj_raiz=17122471"]);
    expect(JSON.parse(init.body as string)).toEqual({ cnpj: CNPJ, regime: "mei", competencia: "2032-03" });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_conferencia", "agir");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.regime.definido", entityType: "SpedPrestador", entityId: CNPJ }));
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/conferencia"]);
  });
  it("`null` apaga a correção: volta ao cadastro ou ao nome, e a frase diz qual", async () => {
    responder("regime_apagar");
    const r = await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: CNPJ, regime: null, competencia: "2032-03" });
    expect(r).toMatchObject({ ok: true, dados: { prestador: { origem: "nome", regime: "normal" } } });
    expect(r.mensagem).toMatch(/volta a normal, pelo nome/);
    expect(JSON.parse(enviado().init.body as string)).toMatchObject({ regime: null });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.regime.apagado" }));
  });
  it("regime fora do enum ou CNPJ inválido: recusa sem chamar; 422 do motor chega com o campo", async () => {
    expect((await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: CNPJ, regime: "simples", competencia: "2032-03" })).ok).toBe(false);
    expect((await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: "123", regime: "mei", competencia: "2032-03" })).ok).toBe(false);
    expect(m.fetch).not.toHaveBeenCalled();
    responder("erro_regime_invalido");
    const r = await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: CNPJ, regime: "mei", competencia: "2032-03" });
    expect(r).toMatchObject({ ok: false, codigo: "parametro_invalido", campos: { regime: expect.any(String) } });
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("portão: sem agir no módulo da Conferência, ou sem token de escrita, nem chama", async () => {
    m.pode.mockResolvedValue(false);
    expect((await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: CNPJ, regime: "mei", competencia: "2032-03" })).ok).toBe(false);
    m.pode.mockResolvedValue(true);
    m.motor.escrita = false;
    expect(await acoes.definirRegimeDoPrestadorNoMotor({ raiz: R, cnpj: CNPJ, regime: "mei", competencia: "2032-03" })).toMatchObject({ codigo: "escrita_nao_habilitada" });
    expect((await acoes.definirRegimeDoPrestadorNoMotor({ raiz: "99999999", cnpj: CNPJ, regime: "mei", competencia: "2032-03" })).ok).toBe(false);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});

describe("Documentos › quarentena: reprocessar (§14.2)", () => {
  it("vira a ação `quarentena` da fila: 202 com a execução, a chave do gesto, audita e relê Documentos e a fila", async () => {
    responder("quarentena_reprocessar");
    const r = await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "desconhecido", chave: CHAVE });
    expect(r).toMatchObject({ ok: true, dados: { id: 68, acao: "quarentena", estado: "pendente" } });
    const { url, init } = enviado();
    expect([init.method, url]).toEqual(["POST", "https://motor/api/connect/v1/quarentena/reprocessar?cnpj_raiz=17122471"]);
    expect(JSON.parse(init.body as string)).toEqual({ classe: "desconhecido" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(CHAVE);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_acervo", "agir");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.quarentena.reprocessada", entityType: "SpedExecucao", entityId: "68" }));
    expect(m.revalidar.mock.calls.map((c) => c[0])).toEqual(["/fiscal/documentos", "/fiscal/operacao"]);
  });
  it("409 reprocessamento_em_andamento: aponta o pedido aberto e devolve o existente; nada auditado", async () => {
    responder("erro_reprocessamento_em_andamento");
    const r = await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "todas", chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "reprocessamento_em_andamento", detalhe: { existente: { id: 68 } }, renovarChave: true });
    expect(r.mensagem).toMatch(/#68/);
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.revalidar).not.toHaveBeenCalled();
  });
  it("sem chave, classe fora do formato, sem agir ou sem token: recusa sem chamar", async () => {
    expect((await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "desconhecido" })).ok).toBe(false);
    expect((await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "../x", chave: CHAVE })).ok).toBe(false);
    m.pode.mockResolvedValue(false);
    expect((await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "desconhecido", chave: CHAVE })).ok).toBe(false);
    m.pode.mockResolvedValue(true);
    m.motor.escrita = false;
    expect(await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "desconhecido", chave: CHAVE })).toMatchObject({ codigo: "escrita_nao_habilitada" });
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("falha de rede: mesma chave na próxima tentativa (renovarChave falso)", async () => {
    m.fetch.mockRejectedValue(new TypeError("rede"));
    const r = await acoes.reprocessarQuarentenaNoMotor({ raiz: R, classe: "desconhecido", chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "falha_de_rede", renovarChave: false });
  });
});
