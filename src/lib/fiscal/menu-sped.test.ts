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
    expect(menuSped(modulos).laterais.map((t) => t.label)).toEqual(["Painel", "Classificação e apuração", "SPED gerados", "Executar"]);
  });
  // No motor, só telas com fonte; Empresas é a entrada de Configurações (26/10/2026).
  it("no modo motor, não oferece telas sem fonte e leva às empresas", () => {
    expect(menuSped(modulos, { motor: true }).telas.map((t) => [t.label, t.href])).toEqual([
      ["Classificação", "/fiscal/classificacao"], ["Apuração", "/fiscal/icms-ipi"], ["Empresas", "/fiscal/configuracoes"], ["DCIP e DIME", "/fiscal/icms-ipi?aba=dcip-dime"],
    ]);
  });
  it("leva ao painel mesmo sem as telas principais", () => {
    const menu = menuSped([{ code: "fiscal_painel", href: "/fiscal" }]);
    expect(menu.laterais.map((t) => [t.label, t.href])).toEqual([["Painel", "/fiscal"]]);
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
  it.each([["/fiscal", "Painel"], ["/fiscal/documentos", "Outras"], ["/fiscal/conferencia", "Outras"], ["/fiscal/classificacao", "SPED"], ["/fiscal/icms-ipi", "SPED"], ["/fiscal/configuracoes", "SPED"], ["/fiscal/contribuicoes", "SPED"], ["/fiscal/entregas", "SPED gerados"], ["/fiscal/operacao", "Executar"], ["/autorizacoes", undefined]])("marca somente a área correspondente a %s", (path, area) => {
    expect(areaSpedAtiva(path)).toBe(area);
  });
  it("não absorve autorizações nem módulos de outros setores", () => {
    expect(menuSped([{ code: "fiscal_autorizacoes", href: "/autorizacoes" }]).href).toBeUndefined();
    expect(MODULOS_SPED.has("bpo_contas_pagar")).toBe(false);
  });
});
