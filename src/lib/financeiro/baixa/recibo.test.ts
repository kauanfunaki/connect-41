import { describe, expect, it } from "vitest";
import { linhasDoRecibo, numeroDoRecibo, pdfDoRecibo, quebrarLinhas, textoParaPdf, type DadosDoRecibo } from "./recibo";

const base: DadosDoRecibo = {
  paymentId: "3f2a9c1e-7b4d-4e2a-9f00-1234567890ab",
  kind: "PAGAR",
  escritorioNome: "41 Contábil",
  empresaNome: "Padaria São João",
  empresaDocumento: "12.345.678/0001-90",
  contraparteNome: "Moinho Ação Ltda",
  contraparteDocumento: "98.765.432/0001-10",
  descricao: "Farinha de outubro",
  documentoNumero: "NF 4512",
  vencimentoKey: "2026-10-10",
  pagamentoKey: "2026-10-20",
  valorDoTituloCentavos: 100000,
  principalCentavos: 100000,
  jurosCentavos: 333,
  multaCentavos: 2000,
  descontoCentavos: 0,
  caixaCentavos: 102333,
  contaBancaria: "Itaú 12345-6",
  observacao: null,
  registradoPor: "Ana",
  registradoEm: new Date("2026-10-20T15:00:00Z"),
  emitidoEm: new Date("2026-10-22T15:00:00Z"),
};

const valorDe = (linhas: { rotulo: string; valor: string }[], rotulo: string) => linhas.find((l) => l.rotulo === rotulo)?.valor;

describe("recibo da baixa", () => {
  it("o número é o começo do id, em maiúsculas", () => {
    expect(numeroDoRecibo(base.paymentId)).toBe("3F2A9C1E");
  });

  it("conta a pagar: a empresa pagou ao fornecedor, com juros e multa e o total pago", () => {
    const c = linhasDoRecibo(base);
    expect(c.titulo).toBe("Recibo");
    expect(c.cabecalho[0]).toBe("41 Contábil");
    expect(c.declaracao).toContain("Padaria São João pagou a Moinho Ação Ltda");
    expect(c.declaracao).toContain("20/10/2026");
    expect(c.declaracao).not.toContain("parcial");
    expect(valorDe(c.partes, "Fornecedor")).toBe("Moinho Ação Ltda — 98.765.432/0001-10");
    expect(valorDe(c.partes, "Empresa")).toContain("12.345.678/0001-90");
    expect(valorDe(c.pagamento, "Vencimento")).toBe("10/10/2026");
    expect(valorDe(c.pagamento, "Data do pagamento")).toBe("20/10/2026");
    expect(valorDe(c.pagamento, "Saiu da conta")).toBe("Itaú 12345-6");
    expect(valorDe(c.pagamento, "Registrado por")).toMatch(/^Ana em 20\/10\/2026/);
    expect(textoParaPdf(valorDe(c.valores, "Juros")!)).toBe("R$ 3,33");
    expect(textoParaPdf(valorDe(c.valores, "Multa")!)).toBe("R$ 20,00");
    expect(c.valores.find((l) => l.destaque)).toMatchObject({ rotulo: "Valor pago" });
    expect(textoParaPdf(valorDe(c.valores, "Valor pago")!)).toBe("R$ 1.023,33");
  });

  it("conta a receber parcial com desconto: recebeu do cliente, e diz que é parcial", () => {
    const c = linhasDoRecibo({ ...base, kind: "RECEBER", principalCentavos: 40000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 500, caixaCentavos: 39500, contaBancaria: null });
    expect(c.declaracao).toContain("recebeu de Moinho Ação Ltda");
    expect(c.declaracao).toContain("(recebimento parcial)");
    expect(valorDe(c.partes, "Cliente")).toBeDefined();
    expect(valorDe(c.valores, "Valor baixado (parcial)")).toBeDefined();
    expect(textoParaPdf(valorDe(c.valores, "Desconto")!)).toBe("- R$ 5,00");
    expect(valorDe(c.pagamento, "Entrou na conta")).toBe("Não informada");
  });

  it("sem descrição, fala do documento", () => {
    expect(linhasDoRecibo({ ...base, descricao: null }).declaracao).toContain("referente a documento NF 4512");
  });

  it("o texto passa para o WinAnsi: espaço fino vira espaço, acento fica, emoji vira ?", () => {
    expect(textoParaPdf("R$ 1,00 — ação 😀")).toBe("R$ 1,00 — ação ?");
  });

  it("quebra as linhas pela largura", () => {
    expect(quebrarLinhas("um dois tres quatro", 9, (t) => t.length)).toEqual(["um dois", "tres", "quatro"]);
  });

  it("gera um PDF de uma página", async () => {
    const bytes = await pdfDoRecibo({ ...base, observacao: "Pago com atraso 😀", descricao: "x ".repeat(200) });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
