import { describe, it, expect } from "vitest";
import { isValidCPF, isValidCNPJ, digitsOnly } from "./common";

describe("isValidCPF", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
    expect(isValidCPF("11144477735")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCPF("111.444.777-00")).toBe(false);
    expect(isValidCPF("12345678900")).toBe(false);
  });

  it("rejeita todos os dígitos iguais", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("00000000000")).toBe(false);
  });

  it("rejeita comprimento inválido", () => {
    expect(isValidCPF("123")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ válido com e sem máscara", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCNPJ("11.222.333/0001-00")).toBe(false);
  });

  it("rejeita todos os dígitos iguais e comprimento errado", () => {
    expect(isValidCNPJ("11111111111111")).toBe(false);
    expect(isValidCNPJ("123")).toBe(false);
  });
});

describe("digitsOnly", () => {
  it("remove máscara e normaliza vazio para null", () => {
    expect(digitsOnly("111.444.777-35")).toBe("11144477735");
    expect(digitsOnly("")).toBeNull();
    expect(digitsOnly(null)).toBeNull();
    expect(digitsOnly("---")).toBeNull();
  });
});
