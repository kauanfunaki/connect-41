import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BalaoDeMensagens, ColunaDaLista, PainelDeConversa } from "./Caixa";
import { RolarParaOFim } from "./Interativos";

// A tela do WhatsApp ainda rolava depois da tela fixa (relato do Kauan,
// 14/10/2026, com print): o balão de mensagens de cada cartão leva um texto
// `sr-only` (position: absolute). Sem um ancestral posicionado dentro da área
// que rola, o bloco de contenção dele era o <main> do casco — o texto escapava
// da rolagem da lista, na altura do último cartão, e esticava a página inteira.
// Toda área que rola na caixa é `relative`: o que é absoluto lá dentro fica
// contido e cortado por ela.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

/** As classes do elemento que tem `overflow-y-auto`. */
function classesDaRolagem(html: string): string[] {
  return [...html.matchAll(/class="([^"]*overflow-y-auto[^"]*)"/g)].map((m) => m[1]!);
}

describe("áreas que rolam na caixa de conversas contêm o que é absoluto", () => {
  it("a lista de cartões", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ColunaDaLista,
        { topo: "abas", rodape: "lote" } as React.ComponentProps<typeof ColunaDaLista>,
        React.createElement(BalaoDeMensagens, { n: 3, rotulo: "mensagens sem resposta" })
      )
    );
    expect(html).toContain('class="sr-only"');
    const rolagens = classesDaRolagem(html);
    expect(rolagens).toHaveLength(1);
    expect(rolagens[0]!.split(" ")).toContain("relative");
  });

  it("o painel da conversa e o corpo que rola", () => {
    const html = renderToStaticMarkup(React.createElement(PainelDeConversa, { barra: null, titulo: "(41) 9999-0000" }, "mensagens"));
    expect(html).toMatch(/<section class="relative /);
    for (const c of classesDaRolagem(html)) expect(c.split(" ")).toContain("relative");
  });

  it("a lista de mensagens que abre no fim", () => {
    const html = renderToStaticMarkup(React.createElement(RolarParaOFim, { quantas: 1 } as React.ComponentProps<typeof RolarParaOFim>, "oi"));
    const rolagens = classesDaRolagem(html);
    expect(rolagens).toHaveLength(1);
    expect(rolagens[0]!.split(" ")).toContain("relative");
  });
});
