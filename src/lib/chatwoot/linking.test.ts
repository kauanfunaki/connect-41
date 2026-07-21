import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhoneBR, resolveLink } from "./linking";

describe("normalizeEmail", () => {
  it("normaliza para minúsculo e remove espaços", () => {
    expect(normalizeEmail("  Fulano@Exemplo.COM ")).toBe("fulano@exemplo.com");
  });
  it("retorna null para vazio/nulo", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhoneBR", () => {
  it("prefixa +55 em número de 11 dígitos (celular com DDD)", () => {
    expect(normalizePhoneBR("47999998888")).toBe("+5547999998888");
  });
  it("prefixa +55 em número de 10 dígitos (fixo com DDD)", () => {
    expect(normalizePhoneBR("4733334444")).toBe("+554733334444");
  });
  it("mantém número que já vem com DDI 55", () => {
    expect(normalizePhoneBR("5547999998888")).toBe("+5547999998888");
  });
  it("remove máscara antes de normalizar", () => {
    expect(normalizePhoneBR("(47) 99999-8888")).toBe("+5547999998888");
  });
  it("retorna null para número que não bate com nenhum formato BR conhecido", () => {
    expect(normalizePhoneBR("12345")).toBeNull();
    expect(normalizePhoneBR(null)).toBeNull();
  });
});

describe("resolveLink", () => {
  it("UNLINKED quando não há candidatos", () => {
    expect(resolveLink([])).toEqual({ linkMethod: "UNLINKED", linkConfidence: null });
  });

  it("ASSISTED quando há mais de um candidato (nunca vincula automaticamente em caso ambíguo)", () => {
    const result = resolveLink([
      { personId: "p1", matchedBy: "email" },
      { personId: "p2", matchedBy: "email" },
    ]);
    expect(result.linkMethod).toBe("ASSISTED");
    expect(result.linkConfidence).toBeNull();
  });

  it("EMAIL com confiança alta quando único candidato bate por e-mail", () => {
    const result = resolveLink([{ personId: "p1", matchedBy: "email" }]);
    expect(result).toEqual({ linkMethod: "EMAIL", personId: "p1", companyId: undefined, linkConfidence: 90 });
  });

  it("PHONE com confiança menor quando único candidato bate por telefone", () => {
    const result = resolveLink([{ companyId: "c1", matchedBy: "phone" }]);
    expect(result).toEqual({ linkMethod: "PHONE", personId: undefined, companyId: "c1", linkConfidence: 70 });
  });
});
