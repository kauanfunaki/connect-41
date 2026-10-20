import { describe, expect, it } from "vitest";
import { podeVirar, presaAoOmie, veioDoOmie } from "./virada";

const doOmie = { omieTitleId: "123", omieMovementId: null };
const movimento = { omieTitleId: null, omieMovementId: "456" };
const manual = { omieTitleId: null, omieMovementId: null };

describe("conta presa ao Omie", () => {
  it("título e movimento vieram do Omie; o manual, não", () => {
    expect(veioDoOmie(doOmie)).toBe(true);
    expect(veioDoOmie(movimento)).toBe(true);
    expect(veioDoOmie(manual)).toBe(false);
  });

  it("presa até a virada, livre depois; a manual nunca está presa", () => {
    expect(presaAoOmie(doOmie, { omieCutoverAt: null })).toBe(true);
    expect(presaAoOmie(movimento, { omieCutoverAt: null })).toBe(true);
    expect(presaAoOmie(doOmie, { omieCutoverAt: new Date("2026-10-20T12:00:00Z") })).toBe(false);
    expect(presaAoOmie(manual, { omieCutoverAt: null })).toBe(false);
  });

  it("sem saber da empresa, a do Omie fica presa — trava na dúvida", () => {
    expect(presaAoOmie(doOmie, null)).toBe(true);
  });
});

describe("podeVirar", () => {
  it("vira com a leitura terminada, e sem leitura quando nunca importou", () => {
    expect(podeVirar({ viradaEm: null, importouAsContas: true, leituraPendente: false })).toEqual({ pode: true });
    expect(podeVirar({ viradaEm: null, importouAsContas: false, leituraPendente: false })).toEqual({ pode: true });
  });

  it("recusa a leitura no meio e a empresa já virada", () => {
    expect(podeVirar({ viradaEm: null, importouAsContas: true, leituraPendente: true })).toMatchObject({ pode: false, motivo: expect.stringMatching(/não chegou ao fim/) });
    expect(podeVirar({ viradaEm: new Date(), importouAsContas: true, leituraPendente: false })).toMatchObject({ pode: false, motivo: expect.stringMatching(/já virou/) });
  });
});
