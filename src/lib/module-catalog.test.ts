import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_ROUTES, getModuleDef, getModulesForSector } from "./module-catalog";
import { DEFAULT_SECTORS } from "./sector-constants";

// O comentário do próprio `module-catalog.ts` conta o defeito que estes testes
// existem para impedir: "duas cópias de um de-para é como um módulo novo aparece
// no menu e não abre". O catálogo e as rotas são essas duas cópias.

describe("catálogo de módulos", () => {
  it("todo módulo tem rota", () => {
    const semRota = MODULE_CATALOG.filter((m) => !MODULE_ROUTES[m.code]).map((m) => m.code);
    expect(semRota).toEqual([]);
  });

  it("toda rota pertence a um módulo do catálogo", () => {
    const orfas = Object.keys(MODULE_ROUTES).filter((code) => !getModuleDef(code));
    expect(orfas).toEqual([]);
  });

  it("código de módulo não se repete", () => {
    const codes = MODULE_CATALOG.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Módulo apontando para setor inexistente some da sidebar sem erro nenhum:
  // `getModulesForSector` só devolve lista vazia.
  it("todo módulo aponta para um setor que existe", () => {
    const setores = new Set(DEFAULT_SECTORS.map((s) => s.code));
    const forasteiros = MODULE_CATALOG.filter((m) => !setores.has(m.sectorCode)).map(
      (m) => `${m.code} -> ${m.sectorCode}`
    );
    expect(forasteiros).toEqual([]);
  });

  it("rota começa com barra", () => {
    const tortas = Object.entries(MODULE_ROUTES).filter(([, r]) => !r.startsWith("/"));
    expect(tortas).toEqual([]);
  });

  it("Documentos Fiscais entrou no setor fiscal", () => {
    const fiscais = getModulesForSector("fiscal").map((m) => m.code);
    expect(fiscais).toContain("fiscal_documentos");
  });

  // Nasce desligado de propósito: a tela é a etapa 3 e o acervo depende da
  // ponte com o SPED. Ligar antes entregaria uma rota que ainda não existe.
  it("Documentos Fiscais nasce desligado", () => {
    expect(getModuleDef("fiscal_documentos")?.defaultEnabled).toBe(false);
  });
});
