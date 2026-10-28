import { describe, expect, it } from "vitest";
import { chaveDoRisco, mensagemDoRisco, riscoDeMulta } from "./riscoDeMulta";

// Outubro de 2026: dia 20 é terça; 24 e 25 são fim de semana.
const SEM_FERIADO = new Set<string>();

describe("risco de multa", () => {
  it("avisa a até 2 dias úteis da data legal, contando só dia útil", () => {
    expect(riscoDeMulta("2026-10-22", "2026-10-20", SEM_FERIADO)).toEqual({ situacao: "PERTO", diasUteis: 2 });
    expect(riscoDeMulta("2026-10-21", "2026-10-20", SEM_FERIADO)).toEqual({ situacao: "PERTO", diasUteis: 1 });
    // Sexta para segunda: o fim de semana não conta.
    expect(riscoDeMulta("2026-10-26", "2026-10-23", SEM_FERIADO)).toEqual({ situacao: "PERTO", diasUteis: 1 });
    expect(riscoDeMulta("2026-10-23", "2026-10-20", SEM_FERIADO)).toBeNull();
  });

  it("feriado também não conta", () => {
    // 22/10 feriado: de 20 a 23 sobram 21 e 23.
    expect(riscoDeMulta("2026-10-23", "2026-10-20", new Set(["2026-10-22"]))).toEqual({ situacao: "PERTO", diasUteis: 2 });
  });

  it("no dia, e depois por 5 dias corridos", () => {
    expect(riscoDeMulta("2026-10-20", "2026-10-20", SEM_FERIADO)).toEqual({ situacao: "HOJE" });
    expect(riscoDeMulta("2026-10-20", "2026-10-21", SEM_FERIADO)).toEqual({ situacao: "PASSOU", dias: 1 });
    expect(riscoDeMulta("2026-10-20", "2026-10-25", SEM_FERIADO)).toEqual({ situacao: "PASSOU", dias: 5 });
    expect(riscoDeMulta("2026-10-20", "2026-10-26", SEM_FERIADO)).toBeNull();
  });

  it("uma chave por situação de cada obrigação", () => {
    expect(chaveDoRisco("o1", { situacao: "PERTO", diasUteis: 2 })).toBe(chaveDoRisco("o1", { situacao: "PERTO", diasUteis: 1 }));
    expect(chaveDoRisco("o1", { situacao: "HOJE" })).not.toBe(chaveDoRisco("o1", { situacao: "PERTO", diasUteis: 1 }));
  });

  it("a mensagem diz o quê, de quem e a data", () => {
    const p = { obrigacao: "DCTFWeb", empresa: "Empresa Exemplo", dataLegal: "2026-10-30" };
    expect(mensagemDoRisco({ situacao: "PERTO", diasUteis: 1 }, p)).toBe(
      "Risco de multa: DCTFWeb de Empresa Exemplo vence na data legal em 1 dia útil (30/10/2026) e ainda está aberta."
    );
    expect(mensagemDoRisco({ situacao: "PASSOU", dias: 2 }, p)).toContain("passou há 2 dias");
  });
});
