import { describe, expect, it } from "vitest";
import { GLOSSARIO_DO_PORTAL, ancoraDoTermo, buscarNoGlossario, linkDoTermo } from "./glossario";

const chaves = (busca: string) => buscarNoGlossario(busca).map((t) => t.chave);

describe("o glossário da Ajuda do portal (11/11/2026)", () => {
  it("tem os termos pedidos na auditoria, cada um com âncora única", () => {
    expect(GLOSSARIO_DO_PORTAL.map((t) => t.chave)).toEqual([
      "competencia",
      "baixa",
      "titulo",
      "dre",
      "caixa-x-competencia",
      "limite-de-aprovacao",
      "exigencia",
      "cmv",
      "notas-fiscais",
    ]);
    const ancoras = GLOSSARIO_DO_PORTAL.map((t) => ancoraDoTermo(t.chave));
    expect(new Set(ancoras).size).toBe(ancoras.length);
    for (const a of ancoras) expect(a).toMatch(/^termo-[a-z0-9-]+$/);
  });

  it("o link leva à âncora na Ajuda", () => {
    expect(linkDoTermo("dre")).toBe("/portal/ajuda#termo-dre");
  });

  it("toda explicação tem texto e termina em ponto", () => {
    for (const t of GLOSSARIO_DO_PORTAL) {
      expect(t.explicacao.length, t.chave).toBeGreaterThan(0);
      for (const f of t.explicacao) expect(f, t.chave).toMatch(/[.:]$/);
    }
  });

  it("a busca ignora acento e caixa, e acha pelos sinônimos", () => {
    expect(chaves("")).toHaveLength(GLOSSARIO_DO_PORTAL.length);
    expect(chaves("COMPETENCIA")).toEqual(expect.arrayContaining(["competencia", "caixa-x-competencia"]));
    expect(chaves("lucro")).toContain("dre");
    expect(chaves("nfse")).toEqual(["notas-fiscais"]);
    expect(chaves("alçada")).toEqual(["limite-de-aprovacao"]);
    expect(chaves("palavra que não existe")).toEqual([]);
  });
});
