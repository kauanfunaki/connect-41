import { describe, expect, it } from "vitest";
import { lerPagamentosDoManual, planejarPagamentosDoManual, type LinhaDoPagamento } from "./pagamentosDoManual";

// Os pagamentos do lançamento manual (lote 7, 28/10/2026): juros, multa,
// desconto e a baixa parcial em mais de uma data.

const HOJE = "2026-10-28";
const linha = (l: Partial<LinhaDoPagamento>): LinhaDoPagamento => ({ data: "2026-10-20", valor: "", juros: "", multa: "", desconto: "", ...l });

describe("os pagamentos do lançamento manual", () => {
  it("a primeira sem valor quita o saldo, com juros e multa", () => {
    const r = planejarPagamentosDoManual([linha({ juros: "12,50", multa: "20" })], 100000, HOJE);
    expect(r).toEqual({
      ok: true,
      dados: [{ dataKey: "2026-10-20", principalCentavos: 100000, jurosCentavos: 1250, multaCentavos: 2000, descontoCentavos: 0, caixaCentavos: 103250, quita: true }],
    });
  });

  it("parcial em duas datas: cada uma contra o que sobra", () => {
    const r = planejarPagamentosDoManual([linha({ valor: "600,00" }), linha({ data: "2026-10-27", valor: "400", desconto: "10" })], 100000, HOJE);
    expect(r.ok && r.dados.map((b) => [b.dataKey, b.principalCentavos, b.caixaCentavos, b.quita])).toEqual([
      ["2026-10-20", 60000, 60000, false],
      ["2026-10-27", 40000, 39000, true],
    ]);
  });

  it("recusa: passa do saldo, segunda sem valor, data futura, depois de quitada", () => {
    expect(planejarPagamentosDoManual([linha({ valor: "1.000,01" })], 100000, HOJE)).toMatchObject({ ok: false });
    expect(planejarPagamentosDoManual([linha({ valor: "500" }), linha({ data: "2026-10-21" })], 100000, HOJE)).toEqual({ ok: false, erro: "Informe o valor do pagamento 2." });
    expect(planejarPagamentosDoManual([linha({ data: "2026-11-01" })], 100000, HOJE)).toMatchObject({ ok: false, erro: expect.stringContaining("futura") });
    expect(planejarPagamentosDoManual([linha({}), linha({ valor: "1" })], 100000, HOJE)).toEqual({ ok: false, erro: "O pagamento 2 sobra: os anteriores já quitam a conta." });
  });

  it("lê o JSON da tela; vazio é sem detalhe", () => {
    expect(lerPagamentosDoManual("")).toEqual({ ok: true, dados: [] });
    expect(lerPagamentosDoManual('[{"data":"2026-10-20","valor":" 10,00 "}]')).toEqual({ ok: true, dados: [linha({ valor: "10,00" })] });
    expect(lerPagamentosDoManual("{")).toMatchObject({ ok: false });
    expect(lerPagamentosDoManual(JSON.stringify(Array(13).fill({})))).toMatchObject({ ok: false });
  });
});
