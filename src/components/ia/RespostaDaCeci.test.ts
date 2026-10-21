import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RespostaDaCeci } from "./RespostaDaCeci";

// O desenho da resposta da Ceci (13/10/2026): Markdown seguro, link interno
// como botão, nada de HTML, imagem ou endereço de fora clicável.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const html = (texto: string) => renderToStaticMarkup(React.createElement(RespostaDaCeci, { texto }));
const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
const ID = "3f1c2a4b-1111-4222-8333-944455556666";

describe("resposta da Ceci na tela", () => {
  it("negrito, lista e título viram marcação de verdade", () => {
    const h = html("**3 pendências** esperando o cliente\n### Vencidas\n- **Confirmar o aluguel** — vencida\n1. primeiro");
    expect(h).toContain('<strong class="font-semibold text-fg">3 pendências</strong>');
    expect(h).toMatch(/<h3[^>]*>Vencidas<\/h3>/);
    expect(h).toMatch(/<ul[^>]*><li[^>]*>.*Confirmar o aluguel/);
    expect(h).toMatch(/<ol[^>]*><li/);
  });

  it("HTML do modelo não vira marcação", () => {
    const h = html('Oi <script>alert(1)</script><img src=x onerror="alert(1)"> **ok** <a href="https://evil.com">aqui</a>');
    expect(h).not.toContain("<script");
    expect(h).not.toContain("<img");
    expect(h).not.toContain("onerror");
    expect(hrefs(h)).toEqual([]);
  });

  it("link interno sozinho na linha vira botão que navega dentro do app", () => {
    const h = html("Resumo.\n[Abrir as pendências aguardando o cliente](/pendencias?recorte=aguardando)");
    expect(hrefs(h)).toEqual(["/pendencias?recorte=aguardando"]);
    expect(h).toContain("Abrir as pendências aguardando o cliente");
    // O botão é o do Connect (borda), não um link de texto.
    expect(h).toMatch(/<a[^>]*class="[^"]*border[^"]*"[^>]*href="\/pendencias\?recorte=aguardando"|<a[^>]*href="\/pendencias\?recorte=aguardando"[^>]*class="[^"]*border/);
  });

  it("o 'Link: /caminho' antigo também vira botão, com o nome da tela", () => {
    const h = html("Link: /pendencias?recorte=aguardando");
    expect(hrefs(h)).toEqual(["/pendencias?recorte=aguardando"]);
    expect(h).toContain("Abrir Pendências ao cliente");
    expect(h).not.toContain("Link:");
  });

  it("endereço de fora nunca é clicável", () => {
    const h = html("[Clique](https://evil.com) e [outro](//evil.com) e https://evil.com/x e ![img](https://evil.com/i.png)");
    expect(hrefs(h)).toEqual([]);
    expect(h).not.toContain("<img");
  });

  it("id interno não aparece; no link do item ele fica só no endereço", () => {
    const h = html(`- **[Confirmar o aluguel](/pendencias/${ID})** (id: ${ID})`);
    expect(hrefs(h)).toEqual([`/pendencias/${ID}`]);
    expect(h.replace(/href="[^"]*"/g, "")).not.toContain(ID);
  });

  it("código de situação cru vira palavra", () => {
    const h = html("Prazo: SEM_PRAZO — Status: ABERTA");
    expect(h).toContain("Prazo: sem prazo — Status: aberta");
  });
});

describe("no portal do cliente (semLinks, 21/10/2026)", () => {
  const doPortal = (texto: string) => renderToStaticMarkup(React.createElement(RespostaDaCeci, { texto, semLinks: true }));

  it("nenhum link: nem o escrito, nem o caminho solto de uma tela da equipe", () => {
    const h = doPortal("Veja [as contas](/pagar) e também /pendencias.\n\n[Abrir as pendências](/pendencias)\n- **[Item](/pagar)** — x");
    expect(hrefs(h)).toEqual([]);
    expect(h).toContain("as contas");
    expect(h).toContain("<strong class=\"font-semibold text-fg\">Item</strong>");
  });

  it("negrito e lista continuam", () => {
    const h = doPortal("**R$ 100,00** a pagar\n- **Aluguel** — vence hoje");
    expect(h).toContain('<strong class="font-semibold text-fg">R$ 100,00</strong>');
    expect(h).toContain("<li");
  });
});
