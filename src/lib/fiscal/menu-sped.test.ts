import { describe, expect, it } from "vitest";
import { getModuleRoute } from "@/lib/module-catalog";
import { areaSpedAtiva, menuSped, MODULOS_SPED } from "./menu-sped";

const modulos = [...MODULOS_SPED].map((code) => ({ code, href: getModuleRoute(code)! }));

describe("menu compacto do SPED", () => {
  it("reúne somente os cinco acessos fiscais solicitados", () => {
    expect(menuSped(modulos).telas.map((t) => t.label)).toEqual([
      "Classificação", "Apuração", "De-Para CFOP", "Regras", "DCIP e DIME",
    ]);
    expect(menuSped(modulos).href).toBe("/fiscal/classificacao");
    expect(menuSped(modulos).laterais.map((t) => t.label)).toEqual(["Classificação e apuração", "SPED gerados", "Executar"]);
  });
  it("remove os acessos desligados e usa uma entrada habilitada", () => {
    const menu = menuSped([{ code: "fiscal_contribuicoes", href: "/fiscal/contribuicoes" }]);
    expect(menu.href).toBe("/fiscal/contribuicoes");
    expect(menu.telas.map((t) => [t.label, t.href])).toEqual([["Apuração", "/fiscal/contribuicoes"]]);
    expect(menuSped([])).toEqual({ href: undefined, telas: [], laterais: [] });
  });
  it("separa entregas e execução mesmo sem os módulos do SPED principal", () => {
    const menu = menuSped([{ code: "fiscal_operacao", href: "/fiscal/operacao" }, { code: "fiscal_entregas", href: "/fiscal/entregas" }]);
    expect(menu.href).toBeUndefined();
    expect(menu.laterais.map((t) => t.label)).toEqual(["SPED gerados", "Executar"]);
  });
  it.each([["/fiscal/icms-ipi", "SPED"], ["/fiscal/configuracoes", "SPED"], ["/fiscal/contribuicoes", "SPED"], ["/fiscal/entregas", "SPED gerados"], ["/fiscal/operacao", "Executar"], ["/autorizacoes", undefined]])("marca somente a área correspondente a %s", (path, area) => {
    expect(areaSpedAtiva(path)).toBe(area);
  });
  it("não absorve autorizações nem módulos de outros setores", () => {
    expect(menuSped([{ code: "fiscal_autorizacoes", href: "/autorizacoes" }]).href).toBeUndefined();
    expect(MODULOS_SPED.has("bpo_contas_pagar")).toBe(false);
  });
});
