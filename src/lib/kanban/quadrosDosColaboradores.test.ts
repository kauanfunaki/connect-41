import { describe, expect, it } from "vitest";
import { podeBloquearQuadros, podeEditarQuadros } from "./quadrosDosColaboradores";

const colaborador = { role: "SECTOR_USER" as const, sectors: ["bpo"], subscriptionReadOnly: false };
const coordenador = { role: "SECTOR_ADMIN" as const, sectors: ["bpo"], subscriptionReadOnly: false };
const admin = { role: "ADMIN" as const, sectors: [], subscriptionReadOnly: false };
const diretoria = { role: "READONLY" as const, sectors: [], subscriptionReadOnly: false };

describe("podeEditarQuadros", () => {
  it("por padrão o colaborador do setor cria e edita", () => {
    expect(podeEditarQuadros(colaborador, "bpo", false)).toBe(true);
  });

  it("com o setor bloqueado, o colaborador não; o coordenador e o administrador sim", () => {
    expect(podeEditarQuadros(colaborador, "bpo", true)).toBe(false);
    expect(podeEditarQuadros(coordenador, "bpo", true)).toBe(true);
    expect(podeEditarQuadros(admin, "bpo", true)).toBe(true);
  });

  it("de outro setor, ou só leitura, nunca", () => {
    expect(podeEditarQuadros(colaborador, "dp", false)).toBe(false);
    expect(podeEditarQuadros(diretoria, "bpo", false)).toBe(false);
    expect(podeEditarQuadros({ ...colaborador, subscriptionReadOnly: true }, "bpo", false)).toBe(false);
  });
});

describe("podeBloquearQuadros", () => {
  it("só quem coordena o setor", () => {
    expect(podeBloquearQuadros(coordenador, "bpo")).toBe(true);
    expect(podeBloquearQuadros(admin, "bpo")).toBe(true);
    expect(podeBloquearQuadros(colaborador, "bpo")).toBe(false);
    expect(podeBloquearQuadros(coordenador, "dp")).toBe(false);
  });
});
