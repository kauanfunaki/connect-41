import { describe, expect, it } from "vitest";
import { lerBuscaDaEscolha } from "./busca";

describe("lerBuscaDaEscolha", () => {
  it("vazio não tem critério", () => {
    expect(lerBuscaDaEscolha("   ", 2026)).toEqual([]);
    expect(lerBuscaDaEscolha(null, 2026)).toEqual([]);
  });

  it("data em vários formatos; sem ano, o do extrato", () => {
    expect(lerBuscaDaEscolha("15/10", 2026)).toEqual([{ tipo: "data", dataKey: "2026-10-15" }]);
    expect(lerBuscaDaEscolha("5/9/2025", 2026)).toEqual([{ tipo: "data", dataKey: "2025-09-05" }]);
    expect(lerBuscaDaEscolha("15/10/26", 2026)).toEqual([{ tipo: "data", dataKey: "2026-10-15" }]);
    expect(lerBuscaDaEscolha("2026-10-15", 2026)).toEqual([{ tipo: "data", dataKey: "2026-10-15" }]);
  });

  it("data impossível não é data", () => {
    expect(lerBuscaDaEscolha("31/02", 2026)[0]!.tipo).not.toBe("data");
  });

  it("valor com centavos, com milhar e com R$", () => {
    expect(lerBuscaDaEscolha("150,00", 2026)).toEqual([{ tipo: "valor", centavos: 15_000 }]);
    expect(lerBuscaDaEscolha("1.234,56", 2026)).toEqual([{ tipo: "valor", centavos: 123_456 }]);
    expect(lerBuscaDaEscolha("R$ 20.190,00", 2026)).toEqual([{ tipo: "valor", centavos: 2_019_000 }]);
  });

  it("inteiro é ambíguo: valor ou pedaço de texto", () => {
    expect(lerBuscaDaEscolha("150", 2026)).toEqual([{ tipo: "inteiro", centavos: 15_000, texto: "150" }]);
    expect(lerBuscaDaEscolha("041", 2026)).toEqual([{ tipo: "inteiro", centavos: 4_100, texto: "041" }]);
  });

  it("palavras viram critérios somados — nome e dia juntos", () => {
    expect(lerBuscaDaEscolha("Localiza 15/10", 2026)).toEqual([
      { tipo: "texto", texto: "Localiza" },
      { tipo: "data", dataKey: "2026-10-15" },
    ]);
  });

  it("zero não é valor", () => {
    expect(lerBuscaDaEscolha("0,00", 2026)).toEqual([{ tipo: "texto", texto: "0,00" }]);
  });
});
