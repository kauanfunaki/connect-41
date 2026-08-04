import { describe, it, expect } from "vitest";
import { isSubscriptionReadOnly, canSelfRegularize } from "./subscription-policy";

describe("isSubscriptionReadOnly", () => {
  it("bloqueia em PAST_DUE e CANCELED", () => {
    expect(isSubscriptionReadOnly("PAST_DUE")).toBe(true);
    expect(isSubscriptionReadOnly("CANCELED")).toBe(true);
  });

  it("não bloqueia em TRIAL nem ACTIVE", () => {
    expect(isSubscriptionReadOnly("TRIAL")).toBe(false);
    expect(isSubscriptionReadOnly("ACTIVE")).toBe(false);
  });

  it("tenant sem assinatura cadastrada nunca é bloqueado", () => {
    // Vale principalmente pros MANAGED antigos, que rodam sem linha em
    // Subscription — a mudança de política de 2026-08-04 não pode travá-los.
    expect(isSubscriptionReadOnly(null)).toBe(false);
    expect(isSubscriptionReadOnly(undefined)).toBe(false);
  });

  it("não olha mais o modo de gestão: a regra é só o status", () => {
    // Guarda da decisão de 2026-08-04. Se alguém reintroduzir a isenção de
    // MANAGED, é aqui que quebra — a assinatura da função nem aceita o modo.
    expect(isSubscriptionReadOnly.length).toBe(1);
  });
});

describe("canSelfRegularize", () => {
  it("só SELF_SERVICE tem a tela /assinatura", () => {
    expect(canSelfRegularize("SELF_SERVICE")).toBe(true);
    expect(canSelfRegularize("MANAGED")).toBe(false);
    expect(canSelfRegularize(null)).toBe(false);
  });
});
