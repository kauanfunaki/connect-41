import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const EMPRESA = "00000000-0000-4000-8000-000000000001";
const REGRA = "00000000-0000-4000-8000-000000000002";
const m = vi.hoisted(() => ({
  role: "ADMIN",
  pode: vi.fn(), empresa: vi.fn(), painel: vi.fn(), audit: vi.fn(),
  regra: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  contas: { findMany: vi.fn() }, transaction: vi.fn(),
  cliente: { criarExecucao: vi.fn(), gravarDecisoes: vi.fn() },
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1", role: m.role }) }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/contabil/servidor", () => ({ empresaContabilVisivel: m.empresa, painelDoContabil: m.painel }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ contabilRegra: m.regra, contabilConta: m.contas, $transaction: m.transaction }) }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => ({ escrita: true, raizes: ["00123456"], cliente: m.cliente }),
  atorDaSessao: async () => ({ id: "u1", nome: "Pessoa fictícia", email: "qa@exemplo.invalido" }),
  estabelecimentosDaRaiz: async () => ({ visiveis: [{ id: 1, matriz: true }] }),
}));
const a = await import("./actions");
const { ErroDoMotor } = await import("@/lib/sped/motor");
const entrada = { empresa: EMPRESA, cnpjFornecedor: "00123456000199", cfop: "1653", contaDebito: "500", contaCredito: "901" };
beforeEach(() => {
  vi.clearAllMocks();
  m.role = "ADMIN";
  m.pode.mockResolvedValue(true);
  m.empresa.mockResolvedValue({ id: EMPRESA, baseId: EMPRESA, cnpj: "00123456000199" });
  m.regra.findFirst.mockResolvedValue({ id: REGRA });
  m.regra.findUnique.mockResolvedValue({ id: REGRA });
  m.regra.update.mockResolvedValue({ id: REGRA });
  m.regra.upsert.mockResolvedValue({ id: REGRA });
  m.contas.findMany.mockResolvedValue([]);
  m.transaction.mockResolvedValue([]);
  m.cliente.gravarDecisoes.mockResolvedValue({ gravadas: 1, registro_ids: [1] });
  m.cliente.criarExecucao.mockResolvedValue({ id: 812 });
  m.painel.mockResolvedValue({
    pendencias: [{ cnpjFornecedor: entrada.cnpjFornecedor, cfop: "1653", nomeFornecedor: "Fornecedor fictício", qtd: 1, centavos: 12345, cadastradaSemConta: false, tipos: ["NF-e"], soCredito: false, sugestao: { reduzido: "901", nome: "Fornecedor fictício", semelhanca: 1 } }],
    cfopContas: [{ cfop: "1653", contaDebito: "500" }],
    configuracao: { modelos: { debitoCte: "", debitoNfse: "", contaImobilizado: "", historicoImobilizado: "" } },
  });
});
function arquivo(texto: string) {
  const dados = new FormData(); dados.set("empresa", EMPRESA); dados.set("arquivo", new File([texto], "regras.csv", { type: "text/csv" })); return dados;
}
const CSV = "cnpj_fornecedor;cfop;conta_debito;conta_credito\r\n00123456000199;1653;500;901\r\n";
describe("edição e importação contábil", () => {
  it("edita pelo id sem deixar uma regra antiga com outra chave", async () => {
    const r = await a.salvarRegra({ ...entrada, id: REGRA, historico: "NF {nf}", valor: "98,76" });
    expect(r.ok).toBe(true);
    expect(m.regra.update).toHaveBeenCalledWith({ where: { id: REGRA }, data: expect.objectContaining({ valor: "98.76", historico: "NF {nf}", updatedById: "u1" }) });
    expect(m.regra.upsert).not.toHaveBeenCalled();
  });
  it("recusa id de outra empresa e conflito de fornecedor/CFOP", async () => {
    m.regra.findFirst.mockResolvedValueOnce(null);
    expect((await a.salvarRegra({ ...entrada, id: REGRA })).ok).toBe(false);
    m.regra.findUnique.mockResolvedValueOnce({ id: "outra-regra" });
    expect((await a.salvarRegra({ ...entrada, id: REGRA })).ok).toBe(false);
    expect(m.regra.update).not.toHaveBeenCalled();
  });
  it("sem permissão ou empresa visível não grava regras", async () => {
    m.pode.mockResolvedValueOnce(false);
    expect((await a.salvarRegra(entrada)).ok).toBe(false);
    m.empresa.mockResolvedValueOnce(null);
    expect((await a.salvarRegra(entrada)).ok).toBe(false);
    expect(m.regra.upsert).not.toHaveBeenCalled();
  });
  it("agir no Contábil não concede exclusão de regras ou CFOP a usuário de setor", async () => {
    m.role = "SECTOR_USER";
    expect((await a.removerRegra({ empresa: EMPRESA, id: REGRA })).ok).toBe(false);
    expect((await a.salvarCfopConta({ empresa: EMPRESA, cfop: "1653", contaDebito: "500", remover: true })).ok).toBe(false);
    expect(m.regra.findFirst).not.toHaveBeenCalled();
  });
  it("prévia não grava; confirmação usa transação e reimportação mantém a chave", async () => {
    const dados = arquivo(CSV);
    const previa = await a.importarRegras(dados);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(previa.ok && "previa" in previa).toBe(true);
    if (!previa.ok || !("previa" in previa)) throw new Error("Faltou prévia.");
    dados.set("confirmar", "sim"); dados.set("impressao", previa.previa.impressao!);
    expect((await a.importarRegras(dados)).ok).toBe(true);
    expect((await a.importarRegras(dados)).ok).toBe(true);
    expect(m.transaction).toHaveBeenCalledTimes(2);
    for (const [args] of m.regra.upsert.mock.calls) expect(args.where).toEqual({ companyId_cnpjFornecedor_cfop: { companyId: EMPRESA, cnpjFornecedor: entrada.cnpjFornecedor, cfop: "1653" } });
  });
  it("arquivo inválido e prévia alterada não gravam parte do lote", async () => {
    const dados = arquivo(CSV + "123;1653;500;901\r\n");
    dados.set("confirmar", "sim");
    expect((await a.importarRegras(dados)).ok).toBe(false);
    const outro = arquivo(CSV); outro.set("confirmar", "sim"); outro.set("impressao", "antiga");
    expect((await a.importarRegras(outro)).ok).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.regra.upsert).not.toHaveBeenCalled();
  });
});
describe("confirmação das sugestões revistas", () => {
  const revisada = { empresa: EMPRESA, mes: "2026-09", selecionadas: [{ cnpj: entrada.cnpjFornecedor, cfop: "1653", credito: "901", referenciaDebito: "500" }] };
  it("grava as contas revistas em transação", async () => {
    expect((await a.confirmarSugestoes(revisada)).ok).toBe(true);
    expect(m.regra.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ contaCredito: "901", contaDebito: "500" }) }));
    expect(m.transaction).toHaveBeenCalledOnce();
  });
  it("se as sugestões mudaram após a revisão, exige revisar novamente", async () => {
    const painel = await m.painel();
    painel.cfopContas[0].contaDebito = "501";
    expect((await a.confirmarSugestoes(revisada)).ok).toBe(false);
    expect(m.regra.upsert).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rejeita seleção duplicada", async () => {
    expect((await a.confirmarSugestoes({ ...revisada, selecionadas: [...revisada.selecionadas, ...revisada.selecionadas] })).ok).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
describe("geração remota e resposta incerta", () => {
  const pedido = { empresa: EMPRESA, competencia: "2026-09", tipoSped: "1", reciboAnterior: "RECIBO-FICTICIO", chave: "contabil:00000000-0000-4000-8000-000000000001" };
  it("retificadora sem recibo não altera parâmetros nem envia pedido", async () => {
    expect((await a.gerarContribuicoes({ ...pedido, reciboAnterior: "" })).ok).toBe(false);
    expect(m.cliente.gravarDecisoes).not.toHaveBeenCalled();
    expect(m.cliente.criarExecucao).not.toHaveBeenCalled();
  });
  it("salva tipo e recibo e envia somente Contribuições com ator da sessão", async () => {
    expect((await a.gerarContribuicoes(pedido)).ok).toBe(true);
    expect(m.cliente.gravarDecisoes).toHaveBeenCalledWith("00123456", "parametro_contribuicoes", expect.objectContaining({ valor: { tipo_escrit: "1", num_rec_anterior: "RECIBO-FICTICIO" } }), expect.objectContaining({ ator: expect.objectContaining({ id: "u1" }) }));
    expect(m.cliente.criarExecucao).toHaveBeenCalledWith("00123456", expect.objectContaining({ acao: "sped_contribuicoes", empresa_id: 1, tipo_sped: "1" }), expect.objectContaining({ chave: pedido.chave }));
  });
  it("falha de rede mantém as chaves ao repetir o gesto", async () => {
    m.cliente.criarExecucao.mockRejectedValueOnce(new ErroDoMotor(0, "falha_de_rede", "Sem resposta."));
    expect(await a.gerarContribuicoes(pedido)).toMatchObject({ ok: false, renovarChave: false });
    expect((await a.gerarContribuicoes(pedido)).ok).toBe(true);
    expect(m.cliente.criarExecucao.mock.calls.map((c) => c[2].chave)).toEqual([pedido.chave, pedido.chave]);
    expect(m.cliente.gravarDecisoes.mock.calls[0][3].chave).toBe(m.cliente.gravarDecisoes.mock.calls[1][3].chave);
  });
});
