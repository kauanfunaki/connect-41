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

describe("o /github antigo", () => {
  it.each([
    ["/github", "/produtividade/github"],
    ["/github/desenvolvedores", "/produtividade/github/desenvolvedores"],
    ["/github/repositorios", "/produtividade/github/repositorios"],
    ["/github/times", "/produtividade/github/times"],
  ])("%s vai para %s", async (de, para) => {
    expect(await destinoDe(de)).toBe(para);
  });

  it("os destinos são as telas de hoje da aba GitHub", async () => {
    expect(Object.values(ROTAS_DO_GITHUB)).toEqual([
      "/produtividade/github",
      "/produtividade/github/desenvolvedores",
      "/produtividade/github/repositorios",
      "/produtividade/github/times",
    ]);
  });

  it("a API e as telas novas não são redirecionadas", async () => {
    for (const caminho of ["/api/github", "/api/github/events", "/produtividade", "/produtividade/pessoas", "/produtividade/github", "/githubber"]) {
      expect(await destinoDe(caminho)).toBeNull();
    }
  });
});

describe("o endereço da Produtividade", () => {
  it("o módulo abre na aba Time", () => {
    expect(MODULE_ROUTES.tech_github_contributions).toBe(ROTAS_DA_PRODUTIVIDADE.time);
  });

  it("a aba de cada endereço, para o menu marcar a ativa", () => {
    expect(abaDaProdutividade("/produtividade")).toBe("time");
    expect(abaDaProdutividade("/produtividade/pessoas")).toBe("pessoas");
    expect(abaDaProdutividade("/produtividade/github")).toBe("github");
    expect(abaDaProdutividade("/produtividade/github/times")).toBe("github");
    expect(abaDaProdutividade("/produtividade-x")).toBeNull();
    expect(abaDaProdutividade("/github")).toBeNull();
  });
});
