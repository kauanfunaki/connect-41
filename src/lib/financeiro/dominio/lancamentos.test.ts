import { describe, expect, it } from "vitest";
import { complementoDaBaixa, lancamentosDasBaixas, type BaixaParaExportar, type DeParaDaEmpresa } from "./lancamentos";

const baixa = (b: Partial<BaixaParaExportar> = {}, conta: Partial<BaixaParaExportar["conta"]> = {}): BaixaParaExportar => ({
  id: "b1",
  dataKey: "2026-10-15",
  kind: "PAGAR",
  principalCentavos: 100000,
  jurosCentavos: 0,
  multaCentavos: 0,
  descontoCentavos: 0,
  bankAccountId: "itau",
  bankAccountNome: "Itaú",
  interestCategoryId: null,
  interestCategoryNome: null,
  discountCategoryId: null,
  discountCategoryNome: null,
  ...b,
  conta: {
    counterpartyId: "imob",
    contraparteNome: "Imobiliária Centro",
    categoryId: "aluguel",
    categoriaNome: "Aluguel",
    descricao: "Aluguel do galpão",
    documento: null,
    rateio: [],
    ...conta,
  },
});

const dePara = (c: Partial<Record<keyof DeParaDaEmpresa, Record<string, string>>> = {}): DeParaDaEmpresa => ({
  CATEGORIA: new Map(Object.entries({ aluguel: "341", juros: "400", descontos: "410", tarifa: "450", ...(c.CATEGORIA ?? {}) })),
  CONTA_BANCARIA: new Map(Object.entries({ itau: "7", ...(c.CONTA_BANCARIA ?? {}) })),
  CONTRAPARTE: new Map(Object.entries(c.CONTRAPARTE ?? {})),
});

describe("lancamentosDasBaixas", () => {
  it("pagamento: D a categoria, C o banco, no dia da baixa e na filial", () => {
    const r = lancamentosDasBaixas([baixa()], dePara(), "11301");
    expect(r.pendencias).toEqual([]);
    expect(r.linhas).toEqual([
      {
        dataKey: "2026-10-15",
        debito: "341",
        credito: "7",
        centavos: 100000,
        codigoHistorico: "",
        complemento: "PAGTO IMOBILIÁRIA CENTRO - ALUGUEL DO GALPÃO",
        codigoFilial: "11301",
      },
    ]);
  });

  it("recebimento: D o banco, C a categoria", () => {
    const [l] = lancamentosDasBaixas([baixa({ kind: "RECEBER" })], dePara(), "").linhas;
    expect(l).toMatchObject({ debito: "7", credito: "341" });
  });

  it("contraparte com conta no de-para: a baixa liquida o fornecedor, não a despesa", () => {
    const [l] = lancamentosDasBaixas([baixa()], dePara({ CONTRAPARTE: { imob: "2344" } }), "").linhas;
    expect(l).toMatchObject({ debito: "2344", credito: "7" });
  });

  it("rateio: uma linha por parte, na proporção, somando o principal", () => {
    const r = lancamentosDasBaixas(
      [
        baixa({ principalCentavos: 10001 }, {
          rateio: [
            { categoryId: "aluguel", categoriaNome: "Aluguel", centavos: 5000 },
            { categoryId: "tarifa", categoriaNome: "Tarifa", centavos: 5000 },
          ],
        }),
      ],
      dePara(),
      ""
    );
    expect(r.linhas.map((l) => [l.debito, l.centavos])).toEqual([
      ["341", 5001],
      ["450", 5000],
    ]);
  });

  it("juros e multa contra o banco, e o desconto ao contrário: o banco anda o que andou", () => {
    const pagar = lancamentosDasBaixas(
      [baixa({ jurosCentavos: 1000, multaCentavos: 200, descontoCentavos: 500, interestCategoryId: "juros", discountCategoryId: "descontos" })],
      dePara(),
      ""
    ).linhas;
    expect(pagar.map((l) => [l.debito, l.credito, l.centavos])).toEqual([
      ["341", "7", 100000],
      ["400", "7", 1200],
      ["7", "410", 500],
    ]);
    // Saiu do banco: 100.000 + 1.200 − 500 = o caixa da baixa.
    const saldoDoBanco = pagar.reduce((s, l) => s + (l.credito === "7" ? -l.centavos : l.debito === "7" ? l.centavos : 0), 0);
    expect(saldoDoBanco).toBe(-100700);

    const receber = lancamentosDasBaixas([baixa({ kind: "RECEBER", descontoCentavos: 500, discountCategoryId: "descontos" })], dePara(), "").linhas;
    expect(receber.map((l) => [l.debito, l.credito, l.centavos])).toEqual([
      ["7", "341", 100000],
      ["410", "7", 500],
    ]);
  });

  it("sem conta no de-para: a baixa inteira vira pendência, com o porquê", () => {
    const casos: [BaixaParaExportar, string][] = [
      [baixa({ bankAccountId: null }), "sem conta bancária"],
      [baixa({ bankAccountId: "bb", bankAccountNome: "BB" }), "A conta bancária BB"],
      [baixa({}, { categoryId: "nova", categoriaNome: "Nova" }), "A categoria Nova"],
      [baixa({}, { categoryId: null, categoriaNome: null }), "Conta sem categoria"],
      [baixa({ jurosCentavos: 10, interestCategoryId: "sem", interestCategoryNome: "Juros pagos" }), "Juros e multa"],
      [baixa({ descontoCentavos: 10, discountCategoryId: null }), "Desconto"],
    ];
    for (const [b, motivo] of casos) {
      const r = lancamentosDasBaixas([b], dePara(), "");
      expect(r.linhas).toEqual([]);
      expect(r.pendencias).toHaveLength(1);
      expect(r.pendencias[0]!.motivo).toContain(motivo);
    }
  });

  it("as linhas saem pela data", () => {
    const r = lancamentosDasBaixas([baixa({ id: "x", dataKey: "2026-10-20" }), baixa({ id: "y", dataKey: "2026-10-02" })], dePara(), "");
    expect(r.linhas.map((l) => l.dataKey)).toEqual(["2026-10-02", "2026-10-20"]);
  });
});

describe("complementoDaBaixa", () => {
  it("sem ponto e vírgula nem quebra de linha — o .txt é separado por ';'", () => {
    expect(complementoDaBaixa(baixa({}, { documento: "123", descricao: "linha 1;\nlinha 2" }))).toBe("PAGTO DOC 123 IMOBILIÁRIA CENTRO - LINHA 1 LINHA 2");
  });
});
