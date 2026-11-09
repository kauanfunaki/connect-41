import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CampoDeFiltro } from "./FiltrosDaTela";

// O painel do Filtros (relato do Kauan no Controle interno, 09/11/2026, com
// print): o painel inteiro rolava junto com a lista de opções e a rolagem dele
// cortava a busca no topo; a lista tinha teto de 210px e deixava branco embaixo
// dela, com opções escondidas; e, na barra, as etiquetas vinham antes do botão.

// O painel só existe aberto, e quem abre é o clique no botão. Aqui o botão é
// trocado por um que já desenha o painel, e diz o que o FiltrosDaTela pediu.
vi.mock("@/components/ui/FilterButton", async () => {
  const R = await import("react");
  return {
    FilterButton: ({
      activeCount,
      semRolagem,
      children,
    }: {
      activeCount?: number;
      semRolagem?: boolean;
      children: React.ReactNode | ((p: { close: () => void }) => React.ReactNode);
    }) =>
      R.createElement(
        "div",
        { "data-botao-filtros": String(activeCount ?? 0), "data-sem-rolagem": String(Boolean(semRolagem)) },
        typeof children === "function" ? children({ close: () => {} }) : children
      ),
  };
});

let busca = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/controle-interno",
  useSearchParams: () => busca,
}));

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const SISTEMAS = ["Sem sistema", "Novo sistema", "Agente SPED", "Domínio XLS para TXT", "n8n", "Connect", "Portal", "Site", "APK"];

const CAMPOS: CampoDeFiltro[] = [
  { chave: "situacao", rotulo: "Situação", vazioLabel: "Em aberto", opcoes: [{ value: "VALIDACAO", label: "Em validação" }] },
  { chave: "tipo", rotulo: "Tipo", opcoes: [{ value: "BUG", label: "Bug" }] },
  { chave: "prioridade", rotulo: "Prioridade", opcoes: [{ value: "1", label: "Média" }] },
  { chave: "sistema", rotulo: "Sistema", opcoes: SISTEMAS.map((label, i) => ({ value: `s${i}`, label })) },
  { chave: "responsavel", rotulo: "Responsável", opcoes: [{ value: "me", label: "Comigo" }] },
  { chave: "atrasados", rotulo: "Prazo", vazioLabel: "Todos", opcoes: [{ value: "1", label: "Atrasados" }] },
];

async function desenhar(campos: CampoDeFiltro[], url: string, naBarra = true) {
  busca = new URLSearchParams(url);
  const { FiltrosDaTela } = await import("./FiltrosDaTela");
  return renderToStaticMarkup(React.createElement(FiltrosDaTela, { campos, naBarra }));
}

/** As classes de cada elemento que rola. */
function rolagens(html: string): string[][] {
  return [...html.matchAll(/class="([^"]*overflow-y-auto[^"]*)"/g)].map((m) => m[1]!.split(" "));
}

describe("FiltrosDaTela — o painel não rola, só a lista de opções", () => {
  it("pede ao botão um painel sem rolagem própria", async () => {
    const html = await desenhar(CAMPOS, "situacao=VALIDACAO&responsavel=me");
    expect(html).toContain('data-sem-rolagem="true"');
  });

  it("a lista ocupa a coluna inteira, sem teto de altura, e é a única coisa que rola", async () => {
    // O primeiro campo é o aberto; com o Sistema à frente a lista passa de 7 e ganha busca.
    const html = await desenhar([CAMPOS[3]!, ...CAMPOS.filter((c) => c.chave !== "sistema")], "situacao=VALIDACAO");
    const [lista, ...outras] = rolagens(html);
    expect(outras).toHaveLength(0);
    expect(lista).toEqual(expect.arrayContaining(["flex-1", "min-h-0", "overscroll-contain"]));
    expect(lista!.some((c) => c.startsWith("max-h-"))).toBe(false);
    // A coluna das opções fica fora da conta da altura: quem dá a altura é a dos campos.
    expect(html).toMatch(/class="[^"]*absolute inset-0[^"]*"/);
    // A busca fica fora da área que rola, acima dela.
    const posBusca = html.indexOf('aria-label="Buscar sistema"');
    const posLista = html.indexOf('role="listbox"');
    expect(posBusca).toBeGreaterThan(-1);
    expect(posBusca).toBeLessThan(posLista);
    for (const s of SISTEMAS) expect(html).toContain(s);
  });

  it("com um campo só a lista mantém o teto próprio (não há coluna ao lado para dar a altura)", async () => {
    const html = await desenhar([CAMPOS[3]!], "");
    const [lista, ...outras] = rolagens(html);
    expect(outras).toHaveLength(0);
    expect(lista).toContain("max-h-[210px]");
    expect(html).not.toMatch(/class="[^"]*absolute inset-0[^"]*"/);
  });
});

describe("FiltrosDaTela — o botão vem antes das etiquetas", () => {
  for (const naBarra of [true, false]) {
    it(naBarra ? "na barra do casco" : "fora da barra", async () => {
      const html = await desenhar(CAMPOS, "situacao=VALIDACAO&responsavel=me", naBarra);
      const posBotao = html.indexOf('data-botao-filtros="2"');
      const posSituacao = html.indexOf('aria-label="Tirar o filtro de situação"');
      const posResponsavel = html.indexOf('aria-label="Tirar o filtro de responsável"');
      expect(posBotao).toBeGreaterThan(-1);
      expect(posSituacao).toBeGreaterThan(posBotao);
      expect(posResponsavel).toBeGreaterThan(posSituacao);
    });
  }
});
