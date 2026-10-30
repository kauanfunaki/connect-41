import { describe, it, expect } from "vitest";
import { conferirImportacao, csvDeRegras, dadosPersistidosDaRegra, regraContabilSchema } from "./regras";
import { parseCsv } from "@/lib/csv";
const EMPRESA = "00000000-0000-4000-8000-000000000001";
const r = { empresa: EMPRESA, cnpjFornecedor: "00123456000199", cfop: "1653", contaDebito: "001", contaCredito: "002" };
describe("regras e importação contábil", () => {
  it("preserva zeros e campos avançados no ciclo CSV → importação", () => {
    const regra = regraContabilSchema.parse({ ...r, historico: 'NF {nf}; fornecedor "A"', observacao: "Primeira\nsegunda", dataLancamento: "2026-10-05", valor: "1234,56", iniciaLote: "S", codigoFilial: "001", centroCustoDebito: "007", centroCustoCredito: "009" });
    const csv = parseCsv(csvDeRegras([regra]));
    const previa = conferirImportacao(EMPRESA, [csv.headers, ...csv.rows]);
    expect(previa.erros).toEqual([]);
    expect(previa.regras).toEqual([regra]);
    expect(dadosPersistidosDaRegra(regra).valor).toBe("1234.56");
  });
  it("rejeita datas inexistentes, valores inválidos e conta não reduzida", () => {
    for (const campos of [{ dataLancamento: "2026-02-30" }, { dataLancamento: "2026-99-99" }, { valor: "0" }, { valor: "1.234,56" }, { valor: "-5" }, { contaCredito: "2.1.3" }]) expect(regraContabilSchema.safeParse({ ...r, ...campos }).success).toBe(false);
  });
  it("aceita cabeçalhos da referência e traduz classificação pelo plano carregado", () => {
    const previa = conferirImportacao(EMPRESA, [["cnpj_fornecedor", "cfop", "conta_debito", "conta_credito"], ["00.123.456/0001-99", "1653", "3.1.01", "002"]], [{ classificacao: "3.1.01", reduzido: "001" }]);
    expect(previa.erros).toEqual([]);
    expect(previa.regras[0]).toMatchObject(r);
  });
  it("ignora pendências não preenchidas e aponta duplicidades e erros por linha", () => {
    const previa = conferirImportacao(EMPRESA, [["cnpj_fornecedor", "cfop", "conta_debito", "conta_credito"], [r.cnpjFornecedor, "", "", ""], [r.cnpjFornecedor, "1653", "001", "002"], [r.cnpjFornecedor, "1653", "001", "002"], ["123", "", "001", "002"]]);
    expect(previa.ignoradas).toBe(1);
    expect(previa.regras).toHaveLength(1);
    expect(previa.erros.map((e) => e.linha)).toEqual([4, 5]);
  });
  it("regra de exclusão geral exige CFOP e não precisa de contas", () => {
    expect(regraContabilSchema.safeParse({ empresa: EMPRESA, cnpjFornecedor: "", cfop: "1653", desconsiderar: true }).success).toBe(true);
    expect(regraContabilSchema.safeParse({ empresa: EMPRESA, cnpjFornecedor: "", cfop: "", desconsiderar: true }).success).toBe(false);
  });
  it("recusa arquivo sem cabeçalho e protege células de fórmula na exportação", () => {
    expect(conferirImportacao(EMPRESA, [["nome"], ["x"]]).erros[0].linha).toBe(1);
    expect(csvDeRegras([{ nomeFornecedor: "=CMD()", cnpjFornecedor: r.cnpjFornecedor }])).toContain("'=CMD()");
  });
});
