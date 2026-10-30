import { describe, it, expect } from "vitest";
import { montarRelatorio, MODELOS_VAZIOS, type Entrada, type Regra } from "./lancamentos";
import { areaContabil, filtrarLancamentos } from "./navegacao";
import { decisaoContabilPermitida, recursoDeContribuicoes } from "./escopoContribuicoes";
import { txtDaDominio } from "@/lib/financeiro/dominio/planilha";
const nota: Entrada = { chave: "n1", tipo: "NF-e", cnpj: "00123456000199", nome: "EMPRESA TESTE", numero: "001", serie: "1", data: "2026-10-01", centavos: 12345, cfops: ["1653"], cancelada: false };
const regra: Regra = { cnpjFornecedor: nota.cnpj, nomeFornecedor: nota.nome, cfop: "1653", contaDebito: "001", contaCredito: "002", historico: "NF {nf}", codigoHistorico: "", desconsiderar: false };
describe("lançamentos e navegação livre", () => {
  it("aplica substituições e mantém os padrões quando vazias", () => {
    const padrao = montarRelatorio([nota], [regra]).lancamentos[0];
    expect(padrao).toMatchObject({ data: nota.data, centavos: nota.centavos });
    const r = montarRelatorio([nota], [{ ...regra, dataLancamento: "2026-10-31", valorCentavos: 999, iniciaLote: "S", codigoFilial: "005", centroCustoDebito: "007", centroCustoCredito: "009" }]);
    expect(r.lancamentos[0]).toMatchObject({ data: "2026-10-31", centavos: 999, codigoFilial: "005", iniciaLote: "S", centroCustoDebito: "007", centroCustoCredito: "009" });
    expect(r.situacoes).toEqual({ n1: "pronta" });
  });
  it("emprestar o crédito de outra regra não empresta data, valor ou centros de custo", () => {
    const r = montarRelatorio([{ ...nota, tipo: "CT-e", cfops: ["1353"] }], [{ ...regra, valorCentavos: 999, dataLancamento: "2026-10-31", centroCustoDebito: "007" }], { ...MODELOS_VAZIOS, debitoCte: "312" });
    expect(r.lancamentos[0]).toMatchObject({ data: nota.data, centavos: nota.centavos, debito: "312", origemDoCredito: "outra_regra" });
    expect(r.lancamentos[0].centroCustoDebito).toBeUndefined();
  });
  it("situações cobrem canceladas, pendentes e prontas, mesmo com mês vazio", () => {
    expect(montarRelatorio([], []).situacoes).toEqual({});
    expect(montarRelatorio([nota], []).situacoes.n1).toBe("pendente");
    expect(montarRelatorio([{ ...nota, cancelada: true }], [regra]).situacoes.n1).toBe("fora");
  });
  it("exportação usa os mesmos filtros, sem limite de prévia", () => {
    const linhas = Array.from({ length: 251 }, (_, i) => montarRelatorio([{ ...nota, chave: String(i) }], [regra]).lancamentos[0]);
    expect(filtrarLancamentos(linhas, { q: "EMPRESA", tipo: "NF-e", cfop: "1653", origem: "regra" })).toHaveLength(251);
    expect(filtrarLancamentos(linhas, { imobilizado: "1" })).toHaveLength(0);
  });
  it("campos opcionais do exportador deixam o BPO compatível", () => {
    const linha = { dataKey: "2026-10-01", debito: "001", credito: "002", centavos: 12345, codigoHistorico: "", complemento: "NF", codigoFilial: "003" };
    expect(txtDaDominio([linha]).toString("latin1")).toContain("2026-10-01;001;002;123,45;;NF;;003;;\r\n");
    expect(txtDaDominio([{ ...linha, iniciaLote: "S", centroCustoDebito: "007", centroCustoCredito: "009" }]).toString("latin1")).toContain(";NF;S;003;007;009\r\n");
  });
  it("abre em visão geral e conserva links legados sem impor sequência", () => {
    expect(areaContabil({})).toBe("visao");
    expect(areaContabil({ aba: "contribuicoes", secao: "arquivos" })).toBe("arquivos");
    expect(areaContabil({ ver: "fora" })).toBe("entradas");
    expect(areaContabil({ ver: "regras" })).toBe("regras");
    expect(areaContabil({ aba: "contribuicoes", secao: "regras" })).toBe("visao");
  });
  it("a autorização contábil é restrita às decisões e recursos de Contribuições", () => {
    expect(decisaoContabilPermitida("parametro_contribuicoes")).toBe(true);
    for (const t of ["ajuste_apuracao", "classificacao_item", "entrega_competencia", "credito_icms_item"]) expect(decisaoContabilPermitida(t)).toBe(false);
    expect(recursoDeContribuicoes({ obrigacao: "icms_ipi" })).toBe(false);
    expect(recursoDeContribuicoes({ acao: "sped" })).toBe(false);
    expect(recursoDeContribuicoes({ acao: "sped_contribuicoes" })).toBe(true);
  });
});
