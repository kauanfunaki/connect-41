import { describe, expect, it } from "vitest";
import { ordenarRenovacoes, situacaoDaRenovacao, type Renovacao } from "./renovacoes";

// As renovações da empresa (04/11/2026).

const r = (chave: string, dias: number | null, positiva = false): Renovacao => ({ chave, tipo: "licenca", rotulo: chave, dias, positiva, href: "/", acao: "Ver" });

describe("as renovações da empresa", () => {
  it("positiva primeiro, depois do que vence antes, sem validade no fim", () => {
    expect(ordenarRenovacoes([r("longe", 200), r("sem", null), r("vencida", -3), r("positiva", null, true), r("perto", 12)]).map((x) => x.chave)).toEqual([
      "positiva",
      "vencida",
      "perto",
      "longe",
      "sem",
    ]);
  });

  it("o selo de cada situação", () => {
    expect(situacaoDaRenovacao(r("a", -1))).toEqual({ texto: "venceu há 1 dia", tom: "perigo" });
    expect(situacaoDaRenovacao(r("a", 0)).texto).toBe("vence hoje");
    expect(situacaoDaRenovacao(r("a", 12))).toEqual({ texto: "vence em 12 dias", tom: "atencao" });
    expect(situacaoDaRenovacao(r("a", 90))).toEqual({ texto: "válida por 90 dias", tom: "sucesso" });
    expect(situacaoDaRenovacao(r("a", null)).tom).toBe("neutro");
    expect(situacaoDaRenovacao(r("a", null, true))).toEqual({ texto: "positiva", tom: "perigo" });
  });
});
