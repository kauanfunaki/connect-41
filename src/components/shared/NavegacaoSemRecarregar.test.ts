import * as React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Filtrar sem recarregar a página (pedido do Kauan no Controle interno,
// 09/11/2026: "ao filtrar, a tela dá um refresh").

let busca = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => busca,
}));

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("urlDoEnvioGet — a URL que o navegador montaria no envio GET", () => {
  it("leva o caminho do action e todos os campos, inclusive os vazios", async () => {
    const { urlDoEnvioGet } = await import("./NavegacaoSemRecarregar");
    const url = urlDoEnvioGet("https://app.useconnect.com.br/processos?antigo=1", [
      ["situacao", "abertos"],
      ["q", ""],
      ["q", "ana & cia"],
    ]);
    // A query que a tela tinha sai: quem diz o que vai são os campos.
    expect(url).toBe("/processos?situacao=abertos&q=&q=ana+%26+cia");
  });

  it("sem campos, só o caminho; arquivo não entra na query", async () => {
    const { urlDoEnvioGet } = await import("./NavegacaoSemRecarregar");
    expect(urlDoEnvioGet("/estoque", [])).toBe("/estoque");
    const arquivo = new File(["x"], "nota.xml");
    expect(urlDoEnvioGet("/estoque", [["anexo", arquivo], ["q", "mesa"]])).toBe("/estoque?q=mesa");
  });
});

describe("ProvedorDaAtualizacao e LinkSemRecarregar", () => {
  it("a barra do topo vem antes do conteúdo, apagada enquanto nada carrega", async () => {
    const { ProvedorDaAtualizacao } = await import("./NavegacaoSemRecarregar");
    const html = renderToStaticMarkup(
      React.createElement(ProvedorDaAtualizacao, null, React.createElement("div", { id: "tela" }, "lista"))
    );
    // O esmaecer da lista é CSS de irmão (`.c41-atualizando[data-ativo] ~ *`):
    // a barra precisa vir antes da tela, no mesmo nível.
    expect(html.indexOf('class="c41-atualizando"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="c41-atualizando"')).toBeLessThan(html.indexOf('id="tela"'));
    expect(html).not.toContain("data-ativo");
  });

  it("o cartão de filtro continua um link de verdade (abrir em outra aba, copiar o endereço)", async () => {
    const { LinkSemRecarregar } = await import("./NavegacaoSemRecarregar");
    const html = renderToStaticMarkup(
      React.createElement(LinkSemRecarregar, { href: "/pendencias?recorte=aguardando", className: "c" }, "Aguardando")
    );
    expect(html).toBe('<a class="c" href="/pendencias?recorte=aguardando">Aguardando</a>');
  });
});

describe("FormularioDeFiltro", () => {
  it("sem JavaScript continua um formulário GET para o mesmo destino", async () => {
    busca = new URLSearchParams("situacao=abertos");
    const { FormularioDeFiltro } = await import("./NavegacaoSemRecarregar");
    const html = renderToStaticMarkup(
      React.createElement(FormularioDeFiltro, { action: "/processos", role: "search" }, React.createElement("input", { name: "q" }))
    );
    expect(html).toMatch(/^<form [^>]*>/);
    expect(html).toContain('action="/processos"');
    expect(html).toContain('method="get"');
    expect(html).toContain('role="search"');
    expect(html).toContain('<input name="q"/></form>');
  });
});

describe("podarSelecao — a seleção fica nas linhas à vista", () => {
  it("tira o que saiu da lista e mantém o mesmo Set quando nada saiu", async () => {
    const { podarSelecao } = await import("./useSelecaoDasLinhas");
    const marcadas = new Set(["a", "b", "c"]);
    expect([...podarSelecao(marcadas, ["b", "c", "d"])]).toEqual(["b", "c"]);
    expect(podarSelecao(marcadas, ["a", "b", "c", "d"])).toBe(marcadas);
    expect(podarSelecao(marcadas, []).size).toBe(0);
  });
});

// O guarda: de 09/10 a 09/11/2026 os filtros recarregavam a página inteira.
const RAIZ = path.resolve(__dirname, "../..");
function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return arquivosTsx(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

describe("nenhum filtro recarrega a página", () => {
  it("painel de filtros, cartões, busca do acervo e seletor de empresa navegam pelo roteador", () => {
    for (const rel of [
      "components/shared/FiltrosDaTela.tsx",
      "components/ui/MetricCard.tsx",
      "components/ui/FaixaDeTotais.tsx",
      "components/fiscal/AcervoFiltros.tsx",
      "components/shared/CompanyFilterSelect.tsx",
    ]) {
      const src = readFileSync(path.join(RAIZ, rel), "utf8");
      expect(src, rel).not.toMatch(/window\.location\.(assign|replace)\(|window\.location\.href\s*=/);
    }
  });

  it("formulário GET do app é o FormularioDeFiltro", () => {
    // Fora: o site público de vagas (outra navegação, sem o AppShell) e o PDF
    // do CT-e, que abre em outra aba pela API.
    const fora = [path.join("app", "carreiras"), path.join("components", "carreiras")];
    const achados = [...arquivosTsx(path.join(RAIZ, "app")), ...arquivosTsx(path.join(RAIZ, "components"))]
      .filter((p) => !fora.some((f) => path.relative(RAIZ, p).startsWith(f)))
      .flatMap((p) =>
        [...readFileSync(p, "utf8").matchAll(/<form\b[^>]*method="get"[^>]*>/g)]
          .filter((m) => !/target="_blank"/.test(m[0]))
          .map(() => path.relative(RAIZ, p))
      )
      .filter((p) => !p.endsWith("NavegacaoSemRecarregar.tsx"));
    expect(achados).toEqual([]);
  });
});
