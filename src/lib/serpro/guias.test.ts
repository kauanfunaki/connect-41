import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDoModelo } from "@/lib/drive/regras";
import { configDeProducao, corpoDoSerpro, TENANT, transportePorServico } from "./teste.fixture";
import { DARF_DO_SICALC, DAS_DO_MEI, DAS_DO_SIMPLES, GUIA_DA_DCTFWEB, PDF_FICTICIO } from "./servicos.fixture";
import { guiaDoRegime, lerGuiaEmitida, lerPedidoDeGuia, lerValor, nomeDaGuia, pedidoDaGuia, servicoDaGuia, type PedidoDeGuia } from "./guias";
import { lerResposta, reais } from "./regras";
import { MODALIDADES_DE_PARCELAMENTO, SERVICOS_DO_SERPRO } from "./servicos";

// As guias federais pela ficha (Fase 2 enxuta, 27/10/2026): o pedido de cada
// guia como a documentação pede, a leitura das respostas do trial e a emissão
// com o PDF na pasta Guias. O transporte é falso: nada vai ao Serpro.

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("./teste.fixture");
  return {
    banco: bancoFalso(),
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
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn(), notifySector: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.isModuleEnabled }));
vi.mock("@/lib/drive/servidor", () => ({
  garantirPastasDaEmpresa: async () => [
    { id: "m-fiscal", name: "Fiscal", active: true },
    { id: "m-guias", name: "Guias", active: true },
  ],
  guardarArquivo: m.guardarArquivo,
}));

const { esquecerTokens } = await import("./cliente");
const { emitirGuia } = await import("./emissaoDeGuia");

const HOJE = "2026-10-27";
const CNPJ = "11444777000161";
const dadosDe = (p: PedidoDeGuia) => JSON.parse(pedidoDaGuia(p, CNPJ).dados === null ? "null" : JSON.stringify(pedidoDaGuia(p, CNPJ).dados));
const ler = (bruto: Record<string, unknown>) => lerPedidoDeGuia(bruto, HOJE);
const pedido = (bruto: Record<string, unknown>) => {
  const r = ler(bruto);
  if (!r.ok) throw new Error(r.erro);
  return r.pedido;
};

describe("o pedido de cada guia", () => {
  it("DAS do Simples: período AAAAMM, e a data de pagamento só quando não é hoje", () => {
    expect(dadosDe(pedido({ tipo: "DAS", periodo: "2026-09" }))).toEqual({ periodoApuracao: "202609" });
    expect(dadosDe(pedido({ tipo: "DAS", periodo: "2026-09", pagamento: HOJE }))).toEqual({ periodoApuracao: "202609" });
    expect(dadosDe(pedido({ tipo: "DAS", periodo: "2026-09", pagamento: "2026-11-05" }))).toEqual({ periodoApuracao: "202609", dataConsolidacao: "20261105" });
    expect(servicoDaGuia(pedido({ tipo: "DAS_MEI", periodo: "2026-09" })).idServico).toBe("GERARDASPDF21");
  });

  it("DCTFWeb: categoria pelo documento, 13º sem mês e a data como inteiro", () => {
    expect(dadosDe(pedido({ tipo: "DCTFWEB", periodo: "2026-09", pagamento: "2026-10-30" }))).toEqual({
      categoria: "GERAL_MENSAL",
      anoPA: "2026",
      mesPA: "09",
      DataAcolhimentoProposta: 20261030,
    });
    expect(dadosDe(pedido({ tipo: "DCTFWEB", periodo: "2025-12", decimoTerceiro: true }))).toEqual({ categoria: "GERAL_13o_SALARIO", anoPA: "2025" });
    expect(JSON.parse(JSON.stringify(pedidoDaGuia(pedido({ tipo: "DCTFWEB", periodo: "2026-09" }), "12345678909").dados))).toMatchObject({ categoria: "PF_MENSAL" });
  });

  it("DARF pelo Sicalc: como o exemplo da documentação (datas ISO, dataPA MM/AAAA, valor com ponto)", () => {
    const p = pedido({ tipo: "DARF", codigoReceita: "2089", extensao: "1", periodo: "2026-09", vencimento: "2026-10-31", valor: "1.234,50", pagamento: "2026-11-10" });
    expect(dadosDe(p)).toEqual({
      codigoReceita: "2089",
      codigoReceitaExtensao: "01",
      tipoPA: "ME",
      dataPA: "09/2026",
      vencimento: "2026-10-31T00:00:00",
      valorImposto: "1234.50",
      dataConsolidacao: "2026-11-10T00:00:00",
    });
    // Sem data na tela, a consolidação é hoje (o campo é obrigatório no Sicalc).
    expect(dadosDe(pedido({ tipo: "DARF", codigoReceita: "2089", extensao: "01", periodo: "2026-09", vencimento: "2026-10-31", valor: "10" })).dataConsolidacao).toBe(
      "2026-10-27T00:00:00"
    );
  });

  it("parcela: o DAS de cada modalidade, com a parcela como número", () => {
    const p = pedido({ tipo: "PARCELA", modalidade: "PARCMEI", parcela: "2026-10" });
    expect(servicoDaGuia(p)).toMatchObject({ idSistema: "PARCMEI", idServico: "GERARDAS201", caminho: "Emitir" });
    expect(dadosDe(p)).toEqual({ parcelaParaEmitir: 202610 });
    for (const modalidade of MODALIDADES_DE_PARCELAMENTO) {
      expect(SERVICOS_DO_SERPRO).toContain(servicoDaGuia(pedido({ tipo: "PARCELA", modalidade, parcela: "2026-10" })));
    }
  });

  it("recusa antes de gastar: período futuro, data passada, DCTFWeb fora do mês, DARF incompleto", () => {
    expect(ler({ tipo: "X" })).toEqual({ ok: false, erro: "Escolha o tipo de guia." });
    expect(ler({ tipo: "DAS", periodo: "2026-11" })).toMatchObject({ ok: false, erro: expect.stringContaining("ainda não começou") });
    expect(ler({ tipo: "DAS", periodo: "2026-09", pagamento: "2026-10-26" })).toMatchObject({ ok: false, erro: expect.stringContaining("anterior a hoje") });
    expect(ler({ tipo: "DAS", periodo: "2026-09", pagamento: "2026-02-30" })).toMatchObject({ ok: false, erro: expect.stringContaining("não é uma data válida") });
    expect(ler({ tipo: "DCTFWEB", periodo: "2026-09", pagamento: "2026-11-03" })).toMatchObject({ ok: false, erro: expect.stringContaining("deste mês") });
    expect(ler({ tipo: "DARF", codigoReceita: "20", extensao: "01", periodo: "2026-09", vencimento: "2026-10-31", valor: "10" })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("4 dígitos"),
    });
    expect(ler({ tipo: "DARF", codigoReceita: "2089", extensao: "01", periodo: "2026-09", vencimento: "2026-10-31", valor: "abc" })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("valor do imposto"),
    });
    expect(ler({ tipo: "PARCELA", modalidade: "OUTRA", parcela: "2026-10" })).toMatchObject({ ok: false, erro: expect.stringContaining("modalidade") });
  });

  it("valores: vírgula, ponto de milhar e R$", () => {
    expect(lerValor("R$ 1.234,56")).toBe(123456);
    expect(lerValor("1234.5")).toBe(123450);
    expect(lerValor("0")).toBeNull();
    expect(lerValor("1,234")).toBeNull();
  });

  it("nome do PDF e a guia do regime", () => {
    expect(nomeDaGuia(pedido({ tipo: "DAS", periodo: "2026-09", pagamento: "2026-11-05" }), "Empresa/Fictícia")).toBe("DAS - Empresa Fictícia - 09-2026 - pagar em 05-11-2026.pdf");
    expect(nomeDaGuia(pedido({ tipo: "PARCELA", modalidade: "PARCSN", parcela: "2026-10" }), "X")).toBe("Parcela PARCSN - X - 10-2026.pdf");
    expect([guiaDoRegime("MEI"), guiaDoRegime("SIMPLES_NACIONAL"), guiaDoRegime("LUCRO_PRESUMIDO"), guiaDoRegime(null)]).toEqual(["DAS_MEI", "DAS", "DCTFWEB", "DCTFWEB"]);
  });
});

describe("a leitura das respostas do trial", () => {
  const lida = (r: { status: number; corpo: string }) => lerResposta(r.status, r.corpo);

  it("DAS e DAS do MEI: total, vencimento e o limite de pagamento", () => {
    expect(lerGuiaEmitida(pedido({ tipo: "DAS", periodo: "2026-09" }), lida(DAS_DO_SIMPLES))).toEqual({
      ok: true,
      dados: { pdf: PDF_FICTICIO, total: 5815, vencimento: "2018-02-20", validoAte: "2022-08-31", numeroDocumento: "07202221401801678" },
    });
    expect(lerGuiaEmitida(pedido({ tipo: "DAS_MEI", periodo: "2026-09" }), lida(DAS_DO_MEI))).toMatchObject({ ok: true, dados: { total: 7779 } });
  });

  it("DCTFWeb e DARF", () => {
    expect(lerGuiaEmitida(pedido({ tipo: "DCTFWEB", periodo: "2026-09" }), lida(GUIA_DA_DCTFWEB))).toEqual({
      ok: true,
      dados: { pdf: PDF_FICTICIO, total: null, vencimento: null, validoAte: null, numeroDocumento: null },
    });
    const darf = pedido({ tipo: "DARF", codigoReceita: "1162", extensao: "01", periodo: "2026-09", vencimento: "2026-10-20", valor: "1000" });
    expect(lerGuiaEmitida(darf, lida(DARF_DO_SICALC))).toMatchObject({ ok: true, dados: { total: 125840, validoAte: "2022-08-31", vencimento: "2026-10-20" } });
  });

  it("parcela: o PDF em docArrecadacaoPdfB64; sem ele, diz que faltou", () => {
    const p = pedido({ tipo: "PARCELA", modalidade: "PARCSN", parcela: "2026-10" });
    expect(lerGuiaEmitida(p, lerResposta(200, corpoDoSerpro({ docArrecadacaoPdfB64: PDF_FICTICIO })))).toMatchObject({ ok: true, dados: { pdf: PDF_FICTICIO } });
    expect(lerGuiaEmitida(p, lerResposta(200, corpoDoSerpro({})))).toEqual({ ok: false, erro: "O Serpro não devolveu o PDF do DAS da parcela." });
  });
});

describe("emitir pela ficha", () => {
  const EMPRESA = { id: "empresa-1", tenantId: TENANT, name: "Empresa Fictícia Ltda", displayName: null, kind: "PESSOA_JURIDICA", cnpj: CNPJ, cpf: null };
  const ativa = { status: "ACTIVE", requestedAt: null, receivedAt: null, validatedAt: null, expiresAt: new Date("2030-12-31T12:00:00Z"), allServices: true, services: null };

  beforeEach(() => {
    m.banco.zerar();
    esquecerTokens();
    vi.clearAllMocks();
    m.banco.conectar(configDeProducao());
    m.banco.tabelas.company.linhas.push({ ...EMPRESA });
    m.banco.tabelas.driveFolder.linhas.push({ id: "pasta-guias", tenantId: TENANT, companyId: EMPRESA.id, parentId: null, deletedAt: null, name: "Guias", systemKey: chaveDoModelo("m-guias") });
    m.banco.estado.autorizacoes.set("11444777", ativa);
  });

  it("emite o DAS recalculado e guarda o PDF na pasta Guias", async () => {
    const t = transportePorServico({ GERARDAS12: () => DAS_DO_SIMPLES });
    const r = await emitirGuia(TENANT, "kauan", EMPRESA.id, { tipo: "DAS", periodo: "2026-09", pagamento: "2026-11-05" }, { transporte: t.transporte, hoje: HOJE });

    expect(r).toEqual({ ok: true, texto: `DAS do Simples Nacional · total ${reais(5815)} · pagável até 31/08/2022. Está em Arquivos › Guias.`, arquivoId: "arquivo-1" });
    expect(JSON.parse(JSON.parse(t.doServico("GERARDAS12")[0].corpo).pedidoDados.dados)).toEqual({ periodoApuracao: "202609", dataConsolidacao: "20261105" });
    const [guardado] = m.guardarArquivo.mock.calls[0];
    expect(guardado.folderId).toBe("pasta-guias");
    expect(guardado.arquivo.name).toBe("DAS - Empresa Fictícia Ltda - 09-2026 - pagar em 05-11-2026.pdf");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "autorizacoes.serpro_guia", entityId: EMPRESA.id }));
    expect(m.banco.estado.chamadas).toEqual([expect.objectContaining({ idServico: "GERARDAS12", cobrada: true, tipoDeCobranca: "EMISSAO", origem: "guias" })]);
  });

  it("sem a pasta Guias, ou com os Arquivos desligados, nada vai ao Serpro", async () => {
    const t = transportePorServico({});
    m.banco.tabelas.driveFolder.zerar();
    expect(await emitirGuia(TENANT, "kauan", EMPRESA.id, { tipo: "DAS", periodo: "2026-09" }, { transporte: t.transporte, hoje: HOJE })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("pasta Guias"),
    });
    m.isModuleEnabled.mockResolvedValueOnce(false);
    expect(await emitirGuia(TENANT, "kauan", EMPRESA.id, { tipo: "DAS", periodo: "2026-09" }, { transporte: t.transporte, hoje: HOJE })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("Arquivos estão desligados"),
    });
    expect(t.chamadas()).toHaveLength(0);
  });

  it("sem a autorização do PGDAS-D, o portão barra antes da chamada (o 403 seria cobrado)", async () => {
    m.banco.estado.autorizacoes.set("11444777", { ...ativa, allServices: false, services: "00103" });
    const t = transportePorServico({});
    const r = await emitirGuia(TENANT, "kauan", EMPRESA.id, { tipo: "DAS", periodo: "2026-09" }, { transporte: t.transporte, hoje: HOJE });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("00146") });
    expect(t.chamadas()).toHaveLength(0);
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });

  it("o Serpro recusa: a mensagem dele, e nada é guardado", async () => {
    const t = transportePorServico({
      GERARDAS12: () => ({ status: 400, corpo: JSON.stringify({ status: 400, dados: "", mensagens: [{ codigo: "[EntradaIncorreta-PGDASD-001]", texto: "Não há declaração transmitida para o período." }] }) }),
    });
    const r = await emitirGuia(TENANT, "kauan", EMPRESA.id, { tipo: "DAS", periodo: "2026-09" }, { transporte: t.transporte, hoje: HOJE });
    expect(r).toEqual({ ok: false, erro: "Não há declaração transmitida para o período." });
    expect(m.guardarArquivo).not.toHaveBeenCalled();
  });

  it("DAS do MEI pedido para uma empresa com CPF: recusa sem chamar", async () => {
    m.banco.tabelas.company.zerar();
    m.banco.tabelas.company.linhas.push({ ...EMPRESA, kind: "PESSOA_FISICA", cnpj: null, cpf: "12345678909" });
    const t = transportePorServico({});
    expect(await emitirGuia(TENANT, "kauan", EMPRESA.id, { tipo: "DAS_MEI", periodo: "2026-09" }, { transporte: t.transporte, hoje: HOJE })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("é de CNPJ"),
    });
    expect(t.chamadas()).toHaveLength(0);
  });
});
