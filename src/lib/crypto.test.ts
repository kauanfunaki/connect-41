import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = "test-secret-key-only-for-vitest";
});

describe("crypto (encryptSecret/decryptSecret)", () => {
  it("round-trip: decripta de volta o texto original", () => {
    const original = "minha-senha-smtp-super-secreta";
    const encrypted = encryptSecret(original);
    expect(decryptSecret(encrypted)).toBe(original);
  });

  it("nunca grava o texto original em claro no payload criptografado", () => {
    const original = "senha-secreta-123";
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toContain(original);
  });

  it("gera IVs diferentes a cada chamada (payloads distintos para o mesmo texto)", () => {
    const original = "mesma-senha";
    expect(encryptSecret(original)).not.toBe(encryptSecret(original));
  });

  it("rejeita payload malformado", () => {
    expect(() => decryptSecret("payload-sem-o-formato-esperado")).toThrow();
  });
});
