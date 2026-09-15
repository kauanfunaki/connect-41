import { describe, it, expect } from "vitest";
import { lerFormularioDeLicenca, MAX_TIPO } from "./licenca-form";
import { situacaoDaLicenca } from "./licencas";

const BASE = { companyId: "c1", kind: "Alvará de Funcionamento" };

describe("lerFormularioDeLicenca", () => {
  it("o mínimo é empresa e tipo; o resto vira nulo", () => {
    expect(lerFormularioDeLicenca(BASE)).toEqual({
      ok: true,
      dados: {
        companyId: "c1",
        kind: "Alvará de Funcionamento",
        organId: null,
        number: null,
        issuedAt: null,
        expiresAt: null,
        notes: null,
      },
    });
  });

  it("lê todos os campos, com as datas ao meio-dia UTC", () => {
    const r = lerFormularioDeLicenca({
      ...BASE,
      organId: "o1",
      number: " 1.700.407 ",
      issuedAt: "2025-08-11",
      expiresAt: "2026-08-11",
      notes: " renovar com o CLCB ",
    });
    expect(r).toEqual({
      ok: true,
      dados: {
        companyId: "c1",
        kind: "Alvará de Funcionamento",
        organId: "o1",
        number: "1.700.407",
        issuedAt: new Date("2025-08-11T12:00:00Z"),
        expiresAt: new Date("2026-08-11T12:00:00Z"),
        notes: "renovar com o CLCB",
      },
    });
  });

  it("sem empresa ou sem tipo recusa", () => {
    expect(lerFormularioDeLicenca({ kind: "Alvará" }).ok).toBe(false);
    expect(lerFormularioDeLicenca({ companyId: "c1", kind: "   " }).ok).toBe(false);
  });

  // Dia e mês trocados na digitação: gravada assim, a licença já nasceria
  // vencida na fila de renovação.
  it("recusa validade antes da emissão", () => {
    const r = lerFormularioDeLicenca({ ...BASE, issuedAt: "2026-08-11", expiresAt: "2026-01-08" });
    expect(r.ok).toBe(false);
  });

  it("recusa data inválida e tipo longo demais", () => {
    expect(lerFormularioDeLicenca({ ...BASE, expiresAt: "11/08/2026" }).ok).toBe(false);
    expect(lerFormularioDeLicenca({ ...BASE, kind: "x".repeat(MAX_TIPO + 1) }).ok).toBe(false);
  });

  // Inscrição municipal não vence: sem validade, a fila mostra "sem validade"
  // em vez de encher a renovação de coisa que não renova.
  it("sem validade vira licença que não entra na renovação", () => {
    const r = lerFormularioDeLicenca({ ...BASE, kind: "Inscrição Municipal" });
    if (!r.ok) throw new Error("deveria ler");
    expect(situacaoDaLicenca({ expiresAt: r.dados.expiresAt, revokedAt: null }, new Date())).toBe("sem_validade");
  });
});
