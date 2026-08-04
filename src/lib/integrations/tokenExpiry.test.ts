import { describe, it, expect } from "vitest";
import { isTokenExpiringSoon, TOKEN_EXPIRY_MARGIN_MS } from "./tokenExpiry";

const now = new Date("2026-08-04T12:00:00.000Z");
const emMinutos = (min: number) => new Date(now.getTime() + min * 60 * 1000);

describe("isTokenExpiringSoon", () => {
  it("token com folga confortável não é renovado", () => {
    expect(isTokenExpiringSoon(emMinutos(30), now)).toBe(false);
    expect(isTokenExpiringSoon(emMinutos(3), now)).toBe(false);
  });

  it("token dentro da margem é tratado como vencendo", () => {
    // 1min de vida restante: ainda válido para o provedor, mas uma operação um
    // pouco lenta terminaria depois do vencimento — daí renovar antes.
    expect(isTokenExpiringSoon(emMinutos(1), now)).toBe(true);
  });

  it("token já vencido conta como vencendo", () => {
    expect(isTokenExpiringSoon(emMinutos(-1), now)).toBe(true);
    expect(isTokenExpiringSoon(emMinutos(-60 * 24), now)).toBe(true);
  });

  it("a fronteira exata da margem não dispara renovação", () => {
    // Estritamente menor: exatamente na margem ainda há tempo de sobra.
    const naMargem = new Date(now.getTime() + TOKEN_EXPIRY_MARGIN_MS);
    expect(isTokenExpiringSoon(naMargem, now)).toBe(false);
    expect(isTokenExpiringSoon(new Date(naMargem.getTime() - 1), now)).toBe(true);
  });
});
