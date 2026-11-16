import { describe, expect, it } from "vitest";
import { ANALISES_DA_DRE, analiseDaUrl, hrefDaAnalise } from "./analisesDaTela";

// As sete análises viraram o seletor "Análise" (16/11/2026, melhoria-718); o
// endereço de cada uma é o que as abas tinham.

describe("as análises da DRE", () => {
  it("são sete, na ordem das abas que havia", () => {
    expect(ANALISES_DA_DRE.map((a) => a.chave)).toEqual([
      "economico-financeiro",
      "reconciliacao",
      "comparativos",
      "forecast",
      "cenarios",
      "indicadores",
      "cfo",
    ]);
  });

  it("sem `aba`, ou com uma que não existe, abre a primeira", () => {
    expect(analiseDaUrl(undefined)).toBe("economico-financeiro");
    expect(analiseDaUrl("nao-existe")).toBe("economico-financeiro");
    expect(analiseDaUrl("cfo")).toBe("cfo");
  });

  it("o endereço leva a análise, a empresa e o mês — o mesmo das abas", () => {
    expect(hrefDaAnalise("reconciliacao", "emp1", "2026-10")).toBe("/dre/analises?aba=reconciliacao&empresa=emp1&mes=2026-10");
  });
});
