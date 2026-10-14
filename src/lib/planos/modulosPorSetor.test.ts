import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, type ModuleDef } from "@/lib/module-catalog";
import { lerModulosDoPlano, linhasDosSetores, modulosPorSetor, setoresIncluidos, totalDeModulos } from "./modulosPorSetor";

// Os módulos de um plano por setor (14/10/2026): os cartões de Planos ("BPO
// 8/17") e as etiquetas "O que inclui" do site.

const m = (code: string, sectorCode: string): ModuleDef => ({
  code,
  label: code,
  sectorCode,
  description: "",
  defaultEnabled: true,
  icon: "Star",
  group: "Operação",
});

const CATALOGO = [m("b1", "bpo"), m("b2", "bpo"), m("b3", "bpo"), m("f1", "fiscal"), m("f2", "fiscal"), m("d1", "dp"), m("g1", "gestao")];

describe("modulosPorSetor", () => {
  it("conta o que o plano libera em cada setor, do setor com mais módulos ao com menos", () => {
    expect(modulosPorSetor(["b1", "b3", "d1"], CATALOGO).map((s) => `${s.rotulo} ${s.liberados}/${s.total}`)).toEqual([
      "BPO 2/3",
      "Fiscal 0/2",
      "DP 1/1",
      "Gestão 0/1",
    ]);
  });

  it("sem restrição (null) libera o catálogo inteiro", () => {
    const setores = modulosPorSetor(null, CATALOGO);
    expect(setores.every((s) => s.liberados === s.total)).toBe(true);
    expect(totalDeModulos(setores)).toEqual({ liberados: 7, total: 7 });
  });

  it("código que saiu do catálogo não conta", () => {
    expect(totalDeModulos(modulosPorSetor(["b1", "modulo_que_saiu"], CATALOGO))).toEqual({ liberados: 1, total: 7 });
  });

  it("a cor vem do setor padrão", () => {
    expect(modulosPorSetor(null, CATALOGO).find((s) => s.code === "bpo")?.cor).toBe("#B7791F");
  });

  it("no catálogo de verdade, os números batem com o total", () => {
    const setores = modulosPorSetor(null);
    expect(totalDeModulos(setores).total).toBe(MODULE_CATALOG.length);
    expect(setores[0]!.code).toBe("bpo");
  });
});

describe("linhasDosSetores", () => {
  it("os cinco primeiros, e o resto numa linha só, com as contas somadas", () => {
    const setores = modulosPorSetor(null);
    const linhas = linhasDosSetores(setores);
    expect(linhas).toHaveLength(6);
    const ultima = linhas[5]!;
    expect(ultima.rotulo).toBe(`${setores[5]!.rotulo} e outros ${setores.length - 6}`);
    expect(ultima.total).toBe(setores.slice(5).reduce((n, s) => n + s.total, 0));
    expect(totalDeModulos(linhas)).toEqual(totalDeModulos(setores));
  });

  it("um setor sobrando não vira grupo de um", () => {
    const setores = modulosPorSetor(null, CATALOGO);
    expect(linhasDosSetores(setores, 3)).toEqual(setores);
  });
});

describe("setoresIncluidos e lerModulosDoPlano", () => {
  it("só os setores com algum módulo liberado", () => {
    expect(setoresIncluidos(["f1", "g1"], CATALOGO).map((s) => s.code)).toEqual(["fiscal", "gestao"]);
  });

  it("a lista guardada no plano: só textos; outra coisa é sem restrição", () => {
    expect(lerModulosDoPlano(["a", 3, "b"])).toEqual(["a", "b"]);
    expect(lerModulosDoPlano(null)).toBeNull();
    expect(lerModulosDoPlano({ a: 1 })).toBeNull();
    expect(lerModulosDoPlano([])).toEqual([]);
  });
});
