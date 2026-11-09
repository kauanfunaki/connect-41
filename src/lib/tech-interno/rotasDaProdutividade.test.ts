import { describe, expect, it } from "vitest";
// O mesmo casamento de caminho que o Next usa nos `redirects()` do next.config.
// @ts-expect-error -- o Next embute o path-to-regexp sem publicar os tipos dele
import { compile, match } from "next/dist/compiled/path-to-regexp";
import nextConfig from "../../../next.config";
import { MODULE_ROUTES } from "@/lib/module-catalog";
import { ROTA_PRODUTIVIDADE, ROTAS_DA_PRODUTIVIDADE, ROTAS_DO_GITHUB } from "./rotasDaProdutividade";

// Produtividade da Tech (05/11/2026): o endereço novo e o `/github` antigo.

async function destinoDe(caminho: string): Promise<string | null> {
  const regras = (await nextConfig.redirects?.()) ?? [];
  for (const r of regras) {
    const achou = match(r.source, { decode: decodeURIComponent })(caminho);
    if (achou) return compile(r.destination)(achou.params as Record<string, string | string[]>);
  }
  return null;
}

// Desde 09/11/2026: Pessoas (desenvolvedores e times) e GitHub (Geral + repositórios), sem o Painel.
describe("os endereços antigos", () => {
  it.each([
    // O Painel saiu (09/11/2026): o endereço dele abre a aba Pessoas.
    ["/produtividade", "/produtividade/pessoas"],
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
  // O endereço do módulo fica na raiz: o menu acende o item em qualquer aba
  // (`/produtividade/…`), e a raiz abre a aba de entrada.
  it("o módulo abre na aba Pessoas, a de entrada", async () => {
    expect(MODULE_ROUTES.tech_github_contributions).toBe(ROTA_PRODUTIVIDADE);
    expect(await destinoDe(ROTA_PRODUTIVIDADE)).toBe(ROTAS_DA_PRODUTIVIDADE.pessoas);
  });

  it("são duas abas: Pessoas e GitHub", () => {
    expect(Object.keys(ROTAS_DA_PRODUTIVIDADE)).toEqual(["pessoas", "github"]);
  });

  it("só o endereço exato redireciona; as abas e as telas de dentro, não", async () => {
    for (const caminho of ["/produtividade/pessoas/times", "/produtividade/github/repositorios", "/produtividade-x"]) {
      expect(await destinoDe(caminho)).toBeNull();
    }
  });
});
