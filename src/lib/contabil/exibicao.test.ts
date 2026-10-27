import { describe, expect, it } from "vitest";
import { documentoNaTela, percentual, rotuloDaColuna, rotuloDoEstado, tomDoEstado, valorDaCelula } from "./exibicao";

describe("SPED contábil: exibição", () => {
  it("usa os rótulos de situação do Fiscal", () => {
    expect(["pendente", "executando", "concluida", "erro", "parada"].map(rotuloDoEstado)).toEqual(["Na fila", "Executando", "Concluída", "Erro", "Parada"]);
    expect(tomDoEstado("erro")).toBe("perigo");
    expect(tomDoEstado("desconhecido")).toBe("neutro");
  });
  it("não calcula andamento sem total", () => {
    expect(percentual({ concluidos: 0, total: 0, etapa: "" })).toBeNull();
    expect(percentual({ concluidos: 1, total: 3, etapa: "" })).toBe(33);
    expect(percentual({ concluidos: 5, total: 3, etapa: "" })).toBe(100);
  });
  it("humaniza cabeçalhos e formata valores, datas e objetos", () => {
    expect(rotuloDaColuna("cnpj_fornecedor")).toBe("CNPJ fornecedor");
    expect(rotuloDaColuna("conta_debito")).toBe("Conta debito");
    expect(valorDaCelula("valor_total", "1234.5")).toMatch(/R\$\s1\.234,50/);
    expect(valorDaCelula("numero", "1234.5")).toBe("1234.5");
    expect(valorDaCelula("data_emissao", "2026-03-05")).toBe("05/03/2026");
    expect(valorDaCelula("competencia", "2026-03")).toBe("Mar/26");
    expect(valorDaCelula("cnpj", "17122471000175")).toBe("17.122.471/0001-75");
    expect(valorDaCelula("sugestao", { nome: "Fornecedor", codigo_reduzido: 12, vazio: null })).toBe("Nome: Fornecedor · Codigo reduzido: 12");
    expect(valorDaCelula("x", null)).toBe("—");
    expect(valorDaCelula("ativo", true)).toBe("Sim");
    expect(documentoNaTela("")).toBe("");
    expect(documentoNaTela("12345678909")).toBe("123.456.789-09");
  });
});
