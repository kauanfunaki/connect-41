import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { linksDoSite } from "@/lib/site/links";
import { SiteDoConnect } from "./SiteDoConnect";

// O site de apresentação, versão 2 (13/10/2026). Sem navegador, a estrutura que
// o Kauan pediu fica conferida no HTML: o topo sem os destinos das portas, um
// botão só no bloco de destaque e nenhum rótulo com espaço a mais.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const links = linksDoSite("https://app.useconnect.com.br");
const pagina = () => renderToStaticMarkup(React.createElement(SiteDoConnect, { links }));

/** Do início da tag que contém `marca` até o fechamento `</tag>` seguinte. */
function trecho(html: string, marca: string, tag: string): string {
  const inicio = html.indexOf(marca);
  expect(inicio).toBeGreaterThanOrEqual(0);
  return html.slice(inicio, html.indexOf(`</${tag}>`, inicio));
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

describe("site do Connect", () => {
  it("o topo só tem âncoras para as seções da própria página", () => {
    const html = pagina();
    const ancoras = hrefs(trecho(html, "<header", "header"));
    expect(ancoras).toEqual(["#o-connect", "#setores", "#sobre-nos"]);
    for (const ancora of ancoras) expect(html).toContain(`id="${ancora.slice(1)}"`);
  });

  // Pedido do Kauan: sem redundância. Portal, vagas e login só nas três portas
  // (uma vez cada) e na lista de links do rodapé.
  it("portal, vagas e login aparecem só nas portas e no rodapé", () => {
    const html = pagina();
    const portas = hrefs(trecho(html, 'aria-label="Por onde entrar"', "section"));
    expect(portas).toEqual([links.portal, links.vagas, links.entrar]);
    const rodape = hrefs(trecho(html, "<footer", "footer"));
    for (const destino of [links.portal, links.vagas, links.entrar]) {
      expect(hrefs(html).filter((h) => h === destino)).toHaveLength(2);
      expect(rodape).toContain(destino);
    }
  });

  it("o bloco de destaque tem um botão só, que desce para O Connect", () => {
    const destaque = trecho(pagina(), 'aria-labelledby="site-titulo"', "section");
    expect(hrefs(destaque)).toEqual(["#o-connect"]);
    expect(destaque).toContain("Conhecer o Connect");
  });

  // O "Entrar   no Connect" da primeira versão: rótulo partido em dois itens de
  // um botão `inline-flex` com `gap` (ver components/site/estilos).
  it("nenhum texto com espaço duro ou espaço a mais", () => {
    const html = pagina();
    expect(html).not.toContain("&nbsp;");
    expect(html).not.toContain(" ");
    const textos = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1]!);
    expect(textos.filter((t) => /\s{2,}/.test(t))).toEqual([]);
    expect(html).toContain(">Entrar no Connect<");
  });

  it("as integrações vão só pelo nome, sem imagem de terceiro", () => {
    const html = pagina();
    for (const nome of ["Omie", "SPED", "WhatsApp", "Google Agenda"]) expect(html).toContain(`>${nome}<`);
    const imagens = [...html.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]!);
    expect(imagens.every((src) => src.startsWith("/brand/"))).toBe(true);
  });
});
