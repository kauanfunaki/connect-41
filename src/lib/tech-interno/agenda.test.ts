import { describe, expect, it } from "vitest";
import { intervaloMes } from "./agenda";
import { lerFiltros } from "./regras";
describe("agenda do Tech", () => {
  it("preserva ano, mês e ano bissexto sem depender do fuso", () => {
    expect(intervaloMes("2024-02")).toMatchObject({ dias: 29, anterior: "2024-01", proximo: "2024-03" });
    expect(intervaloMes("2026-12")).toMatchObject({ anterior: "2026-11", proximo: "2027-01" });
    expect(intervaloMes("2026-01").anterior).toBe("2025-12");
    expect(intervaloMes("2026-10").inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("aceita apenas meses e visões válidos", () => {
    expect(lerFiltros({ visao: "kanban", mes: "2026-10" })).toMatchObject({ view: "kanban", month: "2026-10" });
    expect(lerFiltros({ visao: "agenda", mes: "2026-13" }).month).not.toBe("2026-13");
    expect(lerFiltros({ visao: "outro", mes: "0000-01" })).toMatchObject({ view: "lista" });
  });
});
