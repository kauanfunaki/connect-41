import { describe, expect, it } from "vitest";
import { metaEmTexto, metaSchema, prazoValido, progressoDaMeta } from "./metas";

describe("metaSchema", () => {
  it("aceita a meta e o nível vazio vira qualquer nível", () => {
    const r = metaSchema.safeParse({ teste: "digitacao", alvo: "60", prazo: "2026-11-30" });
    expect(r.success && r.data).toEqual({ teste: "digitacao", nivel: null, alvo: 60, prazo: "2026-11-30" });
  });

  it("o alvo da lógica vai até 10 acertos", () => {
    const r = metaSchema.safeParse({ teste: "logica", nivel: "medio", alvo: 11, prazo: "2026-11-30" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("até 10 acertos");
  });

  it("recusa alvo zero e prazo sem data", () => {
    expect(metaSchema.safeParse({ teste: "digitacao", alvo: 0, prazo: "2026-11-30" }).success).toBe(false);
    expect(metaSchema.safeParse({ teste: "digitacao", alvo: 50, prazo: "30/11" }).success).toBe(false);
  });

  it("prazo de hoje até o limite", () => {
    expect(prazoValido("2026-11-11", "2026-11-11", "2027-11-11")).toBe(true);
    expect(prazoValido("2026-11-10", "2026-11-11", "2027-11-11")).toBe(false);
    expect(prazoValido("2027-12-01", "2026-11-11", "2027-11-11")).toBe(false);
  });
});

describe("progressoDaMeta", () => {
  const meta = { teste: "digitacao" as const, alvo: 60, prazo: "2026-11-30" };

  it("sem resultado: zero, em andamento", () => {
    expect(progressoDaMeta(meta, [], "2026-11-11")).toEqual({ melhor: null, pct: 0, situacao: "andamento" });
  });

  it("o melhor contra o alvo", () => {
    expect(progressoDaMeta(meta, [{ ppm: 45, acertos: null }, { ppm: 52, acertos: null }], "2026-11-11")).toEqual({ melhor: 52, pct: 87, situacao: "andamento" });
  });

  it("atingida vale mesmo depois do prazo; sem atingir, vencida", () => {
    expect(progressoDaMeta(meta, [{ ppm: 61, acertos: null }], "2026-12-05")).toMatchObject({ pct: 100, situacao: "atingida" });
    expect(progressoDaMeta(meta, [{ ppm: 50, acertos: null }], "2026-12-01")).toMatchObject({ situacao: "vencida" });
  });

  it("na lógica e nos atalhos, conta os acertos", () => {
    expect(progressoDaMeta({ teste: "logica", alvo: 8, prazo: "2026-11-30" }, [{ ppm: null, acertos: 6 }], "2026-11-11")).toMatchObject({ melhor: 6, pct: 75 });
  });

  it("o texto da meta", () => {
    expect(metaEmTexto({ teste: "digitacao", nivel: "medio", alvo: 60 })).toBe("60 PPM em Digitação, nível Médio");
    expect(metaEmTexto({ teste: "atalhos", nivel: null, alvo: 20 })).toBe("20 acertos em Atalhos do Excel e do Connect");
  });
});
