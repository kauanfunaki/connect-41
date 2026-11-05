import { describe, expect, it } from "vitest";
import { getModuleRoute } from "@/lib/module-catalog";
import { areaSpedAtiva, menuSped, MODULOS_SPED } from "./menu-sped";

const modulos = [...MODULOS_SPED].map((code) => ({ code, href: getModuleRoute(code)! }));

describe("menu compacto do SPED", () => {
  it("reúne somente os cinco acessos fiscais solicitados", () => {
    expect(menuSped(modulos).telas.map((t) => t.label)).toEqual([
      "Classificação", "Apuração", "De-Para CFOP", "Regras", "DCIP e DIME",
    ]);
    expect(menuSped(modulos).href).toBe("/sped-fiscal");
    expect(menuSped(modulos).laterais.map((t) => [t.label, t.href])).toEqual([["Classificação", "/sped-fiscal/classificacao"], ["Apuração", "/sped-fiscal/apuracao"], ["Fechamento", "/sped-fiscal/fechamento"], ["Gerar SPED", "/sped-fiscal/gerar"]]);
  });
  // No motor, só telas com fonte; Empresas é a entrada de Configurações (26/10/2026).
  it("no modo motor, não oferece telas sem fonte e leva às empresas", () => {
    expect(menuSped(modulos, { motor: true }).telas.map((t) => [t.label, t.href])).toEqual([
      ["Classificação", "/sped-fiscal/motor/classificacao"], ["Apuração", "/sped-fiscal/motor/icms-ipi"], ["Empresas", "/sped-fiscal/motor/configuracoes"], ["DCIP e DIME", "/sped-fiscal/motor/icms-ipi?aba=dcip-dime"],
    ]);
  });
  it("leva ao painel mesmo sem as telas principais", () => {
    const menu = menuSped([{ code: "fiscal_painel", href: "/sped-fiscal/motor" }]);
    expect(menu.laterais.map((t) => [t.label, t.href])).toEqual([["Painel", "/sped-fiscal/motor"]]);
  });
  it("remove os acessos desligados e usa uma entrada habilitada", () => {
    const menu = menuSped([{ code: "fiscal_contribuicoes", href: "/sped-fiscal/motor/contribuicoes" }]);
    expect(menu.href).toBe("/sped-fiscal");
    expect(menu.telas.map((t) => [t.label, t.href])).toEqual([["Apuração", "/sped-fiscal/motor/contribuicoes"]]);
    expect(menuSped([])).toEqual({ href: undefined, telas: [], laterais: [] });
  });
  it("separa entregas e execução mesmo sem os módulos do SPED principal", () => {
    const menu = menuSped([{ code: "fiscal_entregas", href: "/sped-fiscal/motor/entregas" }]);
    expect(menu.href).toBeUndefined();
    expect(menu.laterais.map((t) => t.label)).toEqual(["SPED gerados"]);
  });
  // Gerar SPED é uma das quatro etapas: só o Executar já abre o SPED (29/10/2026).
  it("leva às etapas do SPED com qualquer um dos módulos delas", () => {
    const menu = menuSped([{ code: "fiscal_operacao", href: "/sped-fiscal/motor/operacao" }]);
    expect(menu.href).toBe("/sped-fiscal");
    expect(menu.laterais.map((t) => [t.label, t.area])).toEqual([["Gerar SPED", "Gerar SPED"]]);
  });
  it.each([["/sped-fiscal/motor", "Painel"], ["/sped-fiscal/motor/documentos", "Outras"], ["/sped-fiscal/motor/conferencia", "Outras"], ["/sped-fiscal/classificacao", "Classificação"], ["/sped-fiscal/gerar", "Gerar SPED"], ["/sped-fiscal", "SPED"], ["/sped-fiscal/motor/classificacao", "SPED"], ["/sped-fiscal/motor/icms-ipi", "SPED"], ["/sped-fiscal/motor/configuracoes", "SPED"], ["/sped-fiscal/motor/contribuicoes", "SPED"], ["/sped-fiscal/motor/entregas", "SPED gerados"], ["/sped-fiscal/motor/operacao", "Executar"], ["/autorizacoes", undefined]])("marca somente a área correspondente a %s", (path, area) => {
    expect(areaSpedAtiva(path)).toBe(area);
  });
  it("não absorve autorizações nem módulos de outros setores", () => {
    expect(menuSped([{ code: "fiscal_autorizacoes", href: "/autorizacoes" }]).href).toBeUndefined();
    expect(MODULOS_SPED.has("bpo_contas_pagar")).toBe(false);
  });
});
