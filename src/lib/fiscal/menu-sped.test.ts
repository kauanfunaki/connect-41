import { describe, expect, it } from "vitest";
import { getModuleRoute } from "@/lib/module-catalog";
import { menuSped, MODULOS_SPED } from "./menu-sped";

const modulos = [...MODULOS_SPED].map((code) => ({ code, href: getModuleRoute(code)! }));

describe("menu compacto do SPED", () => {
  it("reúne somente os cinco acessos fiscais solicitados", () => {
    expect(menuSped(modulos).telas.map((t) => t.label)).toEqual([
      "Classificação", "Apuração", "De-Para CFOP", "Regras", "DCIP e DIME",
    ]);
    expect(menuSped(modulos).href).toBe("/fiscal");
  });
  it("remove os acessos desligados e usa uma entrada habilitada", () => {
    const menu = menuSped([{ code: "fiscal_contribuicoes", href: "/fiscal/contribuicoes" }]);
    expect(menu.href).toBe("/fiscal/contribuicoes");
    expect(menu.telas.map((t) => [t.label, t.href])).toEqual([["Apuração", "/fiscal/contribuicoes"]]);
    expect(menuSped([])).toEqual({ href: undefined, telas: [] });
  });
  it("não absorve autorizações nem módulos de outros setores", () => {
    expect(menuSped([{ code: "fiscal_autorizacoes", href: "/autorizacoes" }]).href).toBeUndefined();
    expect(MODULOS_SPED.has("bpo_contas_pagar")).toBe(false);
  });
});
