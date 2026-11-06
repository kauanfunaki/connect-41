import { describe, expect, it } from "vitest";
// O mesmo casamento de caminho que o Next usa nos `redirects()` do next.config.
// @ts-expect-error -- o Next embute o path-to-regexp sem publicar os tipos dele
import { compile, match } from "next/dist/compiled/path-to-regexp";
import nextConfig from "../../../next.config";
import { MODULE_ROUTES } from "@/lib/module-catalog";
import { abaDaProdutividade, ROTAS_DA_PRODUTIVIDADE, ROTAS_DO_GITHUB } from "./rotasDaProdutividade";

// Produtividade da Tech (05/11/2026): o endereço novo e o `/github` antigo.

async function destinoDe(caminho: string): Promise<string | null> {
  const regras = (await nextConfig.redirects?.()) ?? [];
  for (const r of regras) {
    const achou = match(r.source, { decode: decodeURIComponent })(caminho);
    if (achou) return compile(r.destination)(achou.params as Record<string, string | string[]>);
  }
  return null;
}

// Desde 06/11/2026: Painel, Pessoas (desenvolvedores e times) e GitHub (Geral + repositórios).
describe("os endereços antigos", () => {
  it.each([
    ["/github", "/produtividade/github"],
    ["/github/repositorios", "/produtividade/github/repositorios"],
    ["/github/desenvolvedores", "/produtividade/pessoas"],
    ["/github/times", "/produtividade/pessoas/times"],
    ["/produtividade/github/desenvolvedores", "/produtividade/pessoas"],
    ["/produtividade/github/times", "/produtividade/pessoas/times"],
  ])("%s vai para %s", async (de, para) => {
    expect(await destinoDe(de)).toBe(para);
  });

  it("cada visão do painel do GitHub tem a sua tela", () => {
    expect(ROTAS_DO_GITHUB).toEqual({
      general: "/produtividade/github",
      developers: "/produtividade/pessoas",
      repositories: "/produtividade/github/repositorios",
      teams: "/produtividade/pessoas/times",
    });
  });

  it("a API e as telas de hoje não são redirecionadas", async () => {
    for (const caminho of ["/api/github", "/api/github/events", ...Object.values(ROTAS_DA_PRODUTIVIDADE), ...Object.values(ROTAS_DO_GITHUB), "/githubber"]) {
      expect(await destinoDe(caminho)).toBeNull();
    }
  });
});

describe("o endereço da Produtividade", () => {
  it("o módulo abre no Painel", () => {
    expect(MODULE_ROUTES.tech_github_contributions).toBe(ROTAS_DA_PRODUTIVIDADE.painel);
  });

  it("a aba de cada endereço, para o menu marcar a ativa", () => {
    expect(abaDaProdutividade("/produtividade")).toBe("painel");
    expect(abaDaProdutividade("/produtividade/pessoas")).toBe("pessoas");
    expect(abaDaProdutividade("/produtividade/pessoas/times")).toBe("pessoas");
    expect(abaDaProdutividade("/produtividade/github")).toBe("github");
    expect(abaDaProdutividade("/produtividade/github/repositorios")).toBe("github");
    expect(abaDaProdutividade("/produtividade-x")).toBeNull();
    expect(abaDaProdutividade("/github")).toBeNull();
  });
});
