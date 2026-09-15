import { describe, it, expect } from "vitest";
import { lerDataDoCampo, campoDaData } from "./datas";
import { diasAte } from "./licencas";

describe("lerDataDoCampo", () => {
  it("vazio é data nula, não erro", () => {
    expect(lerDataDoCampo("")).toEqual({ ok: true, data: null });
    expect(lerDataDoCampo(null)).toEqual({ ok: true, data: null });
    expect(lerDataDoCampo("   ")).toEqual({ ok: true, data: null });
  });

  it("grava ao meio-dia UTC", () => {
    const r = lerDataDoCampo("2026-09-10");
    expect(r).toEqual({ ok: true, data: new Date("2026-09-10T12:00:00Z") });
  });

  // A regressão que o meio-dia evita: gravada à meia-noite UTC, a data cairia
  // no dia anterior em São Paulo, e "vence hoje" viraria "venceu ontem".
  it("a data digitada é o mesmo dia na contagem em São Paulo", () => {
    const r = lerDataDoCampo("2026-09-15");
    if (!r.ok || !r.data) throw new Error("deveria ler");
    expect(diasAte(r.data, new Date("2026-09-15T20:00:00-03:00"))).toBe(0);
    expect(diasAte(r.data, new Date("2026-09-15T00:30:00-03:00"))).toBe(0);
  });

  it("recusa formato errado e data que não existe", () => {
    expect(lerDataDoCampo("15/09/2026").ok).toBe(false);
    expect(lerDataDoCampo("2026-02-30").ok).toBe(false);
    expect(lerDataDoCampo("2026-13-01").ok).toBe(false);
    expect(lerDataDoCampo("0026-09-15").ok).toBe(false);
  });
});

describe("campoDaData", () => {
  it("devolve o dia gravado, pronto para o campo", () => {
    expect(campoDaData(new Date("2026-09-10T12:00:00Z"))).toBe("2026-09-10");
  });

  it("nulo vira campo vazio", () => {
    expect(campoDaData(null)).toBe("");
  });

  it("ida e volta preservam a data", () => {
    const r = lerDataDoCampo("2027-01-01");
    if (!r.ok) throw new Error("deveria ler");
    expect(campoDaData(r.data)).toBe("2027-01-01");
  });
});
