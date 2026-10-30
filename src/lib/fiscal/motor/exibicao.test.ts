import { describe, expect, it } from "vitest";
import { rotuloDaColuna, valorDaCelula } from "./exibicao";

describe("leitura dos dados do motor", () => {
  it("cabeçalho legível, com siglas em caixa alta", () => {
    expect(rotuloDaColuna("falta_para_aceitar")).toBe("Falta para aceitar");
    expect(rotuloDaColuna("cnpj_fornecedor")).toBe("CNPJ fornecedor");
  });

  it("valor em reais nas colunas de valor e datas no formato brasileiro", () => {
    expect(valorDaCelula("valor_bruto", 1234.5)).toMatch(/1\.234,50/);
    expect(valorDaCelula("data_pagamento", "2026-03-01")).toBe("01/03/2026");
  });

  it("vazio, booleano e objeto ficam legíveis", () => {
    expect(valorDaCelula("x", null)).toBe("—");
    expect(valorDaCelula("x", true)).toBe("Sim");
    expect(valorDaCelula("x", { cfop: "5102", total: 10 })).toMatch(/^CFOP: 5102 · Total: R\$/);
  });
});
