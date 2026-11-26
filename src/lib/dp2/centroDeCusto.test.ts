import { describe, expect, it } from "vitest";
import { contabilizar, csvDosLancamentos, lerContasDaFolha, resumoPorCentro, type RubricaContabil } from "./contabilizacao";

const rubricas = new Map<string, RubricaContabil>([["001", { codigo: "001", nome: "Salário", contaDebito: "3.1.1", contaCredito: null }]]);
const contas = lerContasDaFolha({ salariosAPagar: "2.1.1", inssEmpresaDespesa: "3.1.2", inssARecolher: "2.1.2", provisaoFeriasDespesa: "3.1.3", provisaoFerias: "2.1.3", provisaoDecimoDespesa: "3.1.4", provisaoDecimo: "2.1.4" });
const calc = (centro: string | null, valor: number) => ({
  centro,
  itens: [{ codigo: "001", nome: "Salário", tipo: "PROVENTO", valor }],
  encargos: { inssEmpresa: 0, rat: 0, terceiros: 0 },
  provisoes: { ferias: 0, tercoFerias: 0, decimo: 0, encargosFerias: 0, encargosDecimo: 0 },
});

describe("contabilização por centro de custo", () => {
  it("separa o mesmo lançamento por centro e soma dentro do centro", () => {
    const { lancamentos } = contabilizar([calc("ADM", 1000), calc("ADM", 500), calc("OBRA", 2000), calc(null, 300)], rubricas, contas, "06/2027");
    expect(lancamentos.map((l) => [l.centro ?? "", l.valor])).toEqual([
      ["", 300],
      ["ADM", 1500],
      ["OBRA", 2000],
    ]);
    const csv = csvDosLancamentos(lancamentos, "2027-06-30");
    expect(csv).toContain("Data;Débito;Crédito;Valor;Histórico;Centro de custo");
    expect(csv).toContain("30/06/2027;3.1.1;2.1.1;1500,00;Salário 06/2027;ADM");
  });

  it("sem centro, o CSV fica como sempre foi", () => {
    const { lancamentos } = contabilizar([calc(null, 1000)], rubricas, contas, "06/2027");
    expect(csvDosLancamentos(lancamentos, "2027-06-30")).not.toContain("Centro de custo");
  });
});

describe("resumoPorCentro", () => {
  it("soma por centro, com os sem centro no fim", () => {
    const linha = (centro: string | null, proventos: number) => ({ centro, proventos, descontos: 10, liquido: proventos - 10, fgts: proventos * 0.08, encargos: 1, provisoes: 2 });
    const r = resumoPorCentro([linha(null, 100), linha("OBRA", 200), linha("ADM", 300), linha("ADM", 50)]);
    expect(r.map((x) => [x.centro, x.pessoas, x.proventos])).toEqual([
      ["ADM", 2, 350],
      ["OBRA", 1, 200],
      ["Sem centro de custo", 1, 100],
    ]);
  });
});
