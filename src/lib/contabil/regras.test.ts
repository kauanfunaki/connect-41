import { describe, expect, it } from "vitest";
import { contextoDaUrl, contextoSchema, etapaDaUrl, formatosDoContexto, mesmoContexto, pendenciasAgrupadas, somarValores } from "./regras";
import { getModuleDef, getModuleRoute } from "@/lib/module-catalog";
import type { ContextoContabil, SecaoContabil } from "./types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Stepper } from "@/components/ui/Stepper";

const contexto: ContextoContabil = { cnpj: "17122471000175", periodo: "2026-01", tipos: ["entradas"], incluir_dominio: true };
describe("SPED contábil: contexto, navegação e unidades", () => {
  it("é um módulo próprio do Contábil, ligado e com uma rota direta", () => {
    expect(getModuleDef("contabil_sped")).toMatchObject({ sectorCode: "contabil", defaultEnabled: true, menuDireto: true, label: "SPED" });
    expect(getModuleRoute("contabil_sped")).toBe("/contabil/sped");
  });
  it("oferece CSV anual dos pagamentos e limita formatos ao suporte de cada motor", () => {
    expect(formatosDoContexto({ ...contexto, periodo: "2026", tipos: ["apoio"] })).toContain("csv");
    expect(formatosDoContexto({ ...contexto, periodo: "2026" })).not.toContain("csv");
    expect(formatosDoContexto({ ...contexto, tipos: ["entradas", "saidas"] })).toEqual(["xlsx", "txt"]);
    expect(formatosDoContexto(contexto)).toContain("csv");
  });
  it("soma valores em centavos, inclusive valores altos e negativos", () => { expect(somarValores(["0.10", "0.20", "-0.05"])).toBe("0.25"); expect(somarValores(["90071992547409.91", "0.01"])).toBe("90071992547409.92"); });
  it("recusa competência inválida e faturamento anual", () => {
    expect(contextoSchema.safeParse({ ...contexto, periodo: "2026-13" }).success).toBe(false);
    expect(contextoSchema.safeParse({ ...contexto, periodo: "2026", tipos: ["saidas"] }).success).toBe(false);
    expect(contextoSchema.safeParse({ ...contexto, periodo: "2026", tipos: ["entradas", "apoio"] }).success).toBe(true);
  });
  it("compartilha filtros e etapa na URL sem mudar a inclusão padrão", () => {
    expect(contextoDaUrl(new URLSearchParams("periodo=2025&tipos=entradas,apoio&somente_faltantes=1"), contexto)).toEqual({ ...contexto, periodo: "2025", tipos: ["entradas", "apoio"], incluir_dominio: false });
    expect(etapaDaUrl(new URLSearchParams("etapa=3"))).toBe(3);
    expect(etapaDaUrl(new URLSearchParams("etapa=NaN"))).toBe(1);
  });
  it("não confunde resultados de estabelecimentos ou períodos distintos", () => {
    expect(mesmoContexto(contexto, { ...contexto, tipos: ["entradas"] })).toBe(true);
    expect(mesmoContexto(contexto, { ...contexto, cnpj: "17122471001490" })).toBe(false);
    expect(mesmoContexto(contexto, { ...contexto, periodo: "2025-12" })).toBe(false);
    expect(mesmoContexto(contexto, { ...contexto, incluir_dominio: false })).toBe(false);
  });
  it("agrupa uma regra de fornecedor no ano preservando documentos e competências", () => {
    const p = { id: "forn-cfop", tipo: "entradas" as const, cnpj_fornecedor: "99999999000199", nome: "Fornecedor fictício", cfop: "1556", qtd: 2, valor: "100.10", motivo: "Sem conta", competencias: ["2026-01"] };
    const secoes = [{ pendencias: [p] }, { pendencias: [{ ...p, qtd: 3, valor: "200.20", competencias: ["2026-02"] }] }] as SecaoContabil[];
    const agrupadas = pendenciasAgrupadas(secoes);
    expect(agrupadas).toHaveLength(1);
    expect(agrupadas[0]).toMatchObject({ qtd: 5, valor: "300.30", competencias: ["2026-01", "2026-02"] });
    expect(p.qtd).toBe(2);
  });
  it("permite abrir uma etapa de consulta sem marcá-la como concluída e preserva o padrão antigo", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { steps: [{ label: "Pendente", status: "upcoming" }, { label: "Disponível", status: "upcoming", disabled: false }] }));
    expect(html).toMatch(/disabled="".*?Pendente/);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).not.toContain("concluída");
  });
});
