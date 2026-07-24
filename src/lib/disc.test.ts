import { describe, expect, it } from "vitest";
import { DISC_BANK, TOTAL_BLOCKS, type DiscDimension } from "./discBank";
import { scoreDisc, validateDiscAnswers, type DiscAnswer } from "./disc";

// Converte specs (block, dimensão-mais, dimensão-menos) em DiscAnswer real,
// resolvendo o índice de cada dimensão dentro do bloco embaralhado.
function buildAnswers(specs: { block: number; mais: DiscDimension; menos: DiscDimension }[]): DiscAnswer[] {
  return specs.map(({ block, mais, menos }) => ({
    block,
    maisIndex: DISC_BANK[block]!.findIndex((w) => w.dim === mais),
    menosIndex: DISC_BANK[block]!.findIndex((w) => w.dim === menos),
  }));
}

describe("scoreDisc", () => {
  it("perfil D puro (mais=D, menos=I em todos os blocos) — primary D sem secondary", () => {
    const answers = buildAnswers(
      Array.from({ length: TOTAL_BLOCKS }, (_, block) => ({ block, mais: "D" as const, menos: "I" as const }))
    );
    const result = scoreDisc(answers);

    expect(result.scores.D.net).toBe(24);
    expect(result.scores.I.net).toBe(-24);
    expect(result.scores.S.net).toBe(0);
    expect(result.scores.C.net).toBe(0);
    expect(result.primaryProfile).toBe("D");
    expect(result.secondaryProfile).toBeNull();
  });

  it("gap de exatamente 3 (margem) reporta secondaryProfile", () => {
    const specs: { block: number; mais: DiscDimension; menos: DiscDimension }[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ block: i, mais: "D" as const, menos: "C" as const })),
      { block: 5, mais: "I", menos: "S" },
      { block: 6, mais: "I", menos: "S" },
      { block: 7, mais: "C", menos: "S" },
      ...Array.from({ length: 8 }, (_, i) => ({ block: 8 + i, mais: "D" as const, menos: "I" as const })),
      ...Array.from({ length: 8 }, (_, i) => ({ block: 16 + i, mais: "I" as const, menos: "D" as const })),
    ];
    expect(specs).toHaveLength(TOTAL_BLOCKS);

    const result = scoreDisc(buildAnswers(specs));

    expect(result.scores.D.net).toBe(5);
    expect(result.scores.I.net).toBe(2);
    expect(result.scores.S.net).toBe(-3);
    expect(result.scores.C.net).toBe(-4);
    expect(result.primaryProfile).toBe("D");
    expect(result.secondaryProfile).toBe("I");
  });

  it("gap de exatamente 4 (fora da margem) não reporta secondaryProfile", () => {
    const specs: { block: number; mais: DiscDimension; menos: DiscDimension }[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ block: i, mais: "D" as const, menos: "C" as const })),
      { block: 5, mais: "I", menos: "S" },
      ...Array.from({ length: 9 }, (_, i) => ({ block: 6 + i, mais: "D" as const, menos: "I" as const })),
      ...Array.from({ length: 9 }, (_, i) => ({ block: 15 + i, mais: "I" as const, menos: "D" as const })),
    ];
    expect(specs).toHaveLength(TOTAL_BLOCKS);

    const result = scoreDisc(buildAnswers(specs));

    expect(result.scores.D.net).toBe(5);
    expect(result.scores.I.net).toBe(1);
    expect(result.primaryProfile).toBe("D");
    expect(result.secondaryProfile).toBeNull();
  });

  it("empate no topo é desempatado por prioridade D>I>S>C, mas ainda conta como secondary", () => {
    const specs: { block: number; mais: DiscDimension; menos: DiscDimension }[] = [
      ...Array.from({ length: 12 }, (_, i) => ({ block: i, mais: "I" as const, menos: "C" as const })),
      ...Array.from({ length: 12 }, (_, i) => ({ block: 12 + i, mais: "D" as const, menos: "S" as const })),
    ];
    const result = scoreDisc(buildAnswers(specs));

    expect(result.scores.D.net).toBe(12);
    expect(result.scores.I.net).toBe(12);
    expect(result.primaryProfile).toBe("D"); // D vem antes de I na prioridade de desempate
    expect(result.secondaryProfile).toBe("I");
  });

  it("pct normaliza net (-24..24) para 0-100", () => {
    const answers = buildAnswers(
      Array.from({ length: TOTAL_BLOCKS }, (_, block) => ({ block, mais: "D" as const, menos: "I" as const }))
    );
    const result = scoreDisc(answers);
    expect(result.scores.D.pct).toBe(100); // net +24
    expect(result.scores.I.pct).toBe(0); // net -24
    expect(result.scores.S.pct).toBe(50); // net 0
  });
});

describe("validateDiscAnswers", () => {
  function fullValidAnswers(): DiscAnswer[] {
    return Array.from({ length: TOTAL_BLOCKS }, (_, block) => ({ block, maisIndex: 0, menosIndex: 1 }));
  }

  it("aceita um conjunto completo e válido", () => {
    expect(validateDiscAnswers(fullValidAnswers())).not.toBeNull();
  });

  it("rejeita entrada que não é array", () => {
    expect(validateDiscAnswers({})).toBeNull();
    expect(validateDiscAnswers(null)).toBeNull();
    expect(validateDiscAnswers("não é array")).toBeNull();
  });

  it("rejeita quantidade de blocos diferente de 24", () => {
    expect(validateDiscAnswers(fullValidAnswers().slice(0, 23))).toBeNull();
    expect(validateDiscAnswers([...fullValidAnswers(), { block: 0, maisIndex: 0, menosIndex: 1 }])).toBeNull();
  });

  it("rejeita bloco duplicado (e consequentemente bloco faltante)", () => {
    const answers = fullValidAnswers();
    answers[23] = { block: 22, maisIndex: 0, menosIndex: 1 }; // duplica o bloco 22, bloco 23 nunca aparece
    expect(validateDiscAnswers(answers)).toBeNull();
  });

  it("rejeita maisIndex === menosIndex no mesmo bloco", () => {
    const answers = fullValidAnswers();
    answers[0] = { block: 0, maisIndex: 2, menosIndex: 2 };
    expect(validateDiscAnswers(answers)).toBeNull();
  });

  it("rejeita índice fora do intervalo 0-3", () => {
    const answers = fullValidAnswers();
    answers[0] = { block: 0, maisIndex: 4, menosIndex: 1 };
    expect(validateDiscAnswers(answers)).toBeNull();
  });

  it("rejeita item malformado (campos faltando ou de tipo errado)", () => {
    const answers: unknown[] = fullValidAnswers();
    answers[0] = { block: 0, maisIndex: "0", menosIndex: 1 };
    expect(validateDiscAnswers(answers)).toBeNull();
  });
});
