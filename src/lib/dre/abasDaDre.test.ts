import { describe, expect, it } from "vitest";
import { abasVisiveis, hrefDaAbaDaDre, type AbaDaDre } from "./abasDaDre";
import { trocaDosImpostos } from "./visaoDosImpostos";
import { opcoesDaUrl } from "./estrutura";

describe("hrefDaAbaDaDre", () => {
  it("leva o mês no formato de cada tela", () => {
    expect(hrefDaAbaDaDre("caixa", "emp1", "2026-09")).toBe("/dre?empresa=emp1&mes=2026-9");
    expect(hrefDaAbaDaDre("competencia", "emp1", "2026-09")).toBe("/dre/economica?empresa=emp1&mes=2026-09");
    expect(hrefDaAbaDaDre("analises", "emp1", "2026-10")).toBe("/dre/analises?empresa=emp1&mes=2026-10");
    expect(hrefDaAbaDaDre("orcamento", "emp1", "2026-10")).toBe("/dre/orcamento?empresa=emp1&ano=2026");
  });

  it("sem mês (ou com mês fora do formato), só a empresa: cada tela abre no mais recente", () => {
    expect(hrefDaAbaDaDre("caixa", "emp1")).toBe("/dre?empresa=emp1");
    expect(hrefDaAbaDaDre("competencia", "emp1", null)).toBe("/dre/economica?empresa=emp1");
    expect(hrefDaAbaDaDre("analises", "emp1", "2026-9")).toBe("/dre/analises?empresa=emp1");
  });
});

describe("abasVisiveis", () => {
  const todas = new Set<AbaDaDre>(["caixa", "competencia", "analises", "orcamento"]);

  it("mantém a ordem fixa e só o que a pessoa abre", () => {
    expect(abasVisiveis(todas, "analises")).toEqual(["caixa", "competencia", "analises", "orcamento"]);
    expect(abasVisiveis(new Set<AbaDaDre>(["caixa", "orcamento"]), "caixa")).toEqual(["caixa", "orcamento"]);
  });

  it("a aba aberta sempre aparece, mesmo fora das liberadas", () => {
    expect(abasVisiveis(new Set<AbaDaDre>(["caixa"]), "competencia")).toEqual(["caixa", "competencia"]);
  });

  it("uma aba só não é fileira: some", () => {
    expect(abasVisiveis(new Set<AbaDaDre>(["caixa"]), "caixa")).toEqual([]);
    expect(abasVisiveis(new Set<AbaDaDre>(), "caixa")).toEqual([]);
  });
});

describe("trocaDosImpostos", () => {
  it("no padrão (impostos no EBITDA), leva para fora do resultado sem perder o período", () => {
    const r = trocaDosImpostos(opcoesDaUrl(undefined), "/dre", { empresa: "emp1", mes: "2026-9", impostos: undefined });
    expect(r).toEqual({ href: "/dre?empresa=emp1&mes=2026-9&impostos=fora", rotulo: "Ver com impostos fora do resultado" });
  });

  it("fora do resultado, volta ao padrão", () => {
    const r = trocaDosImpostos(opcoesDaUrl("fora"), "/dre/economica", { empresa: "emp1", visao: "acumulado", impostos: "fora" });
    expect(r).toEqual({ href: "/dre/economica?empresa=emp1&visao=acumulado", rotulo: "Ver com impostos no EBITDA" });
  });
});
