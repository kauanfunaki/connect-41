import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Ceci, type EstadoDaCeci } from "./Ceci";

// A Ceci (13/10/2026). Sem navegador, o desenho fica conferido no HTML: os
// quatro estados são desenhos diferentes, o tamanho vem da prop, o "pensando"
// leva a classe que gira o anel (e que o prefers-reduced-motion desliga em
// globals.css) e duas Cecis na mesma tela não dividem o id do degradê.

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const ESTADOS: EstadoDaCeci[] = ["parada", "pensando", "deuCerto", "naoConsegui"];
const desenhar = (props: React.ComponentProps<typeof Ceci> = {}) => renderToStaticMarkup(React.createElement(Ceci, props));
/** Só o rosto: tira o id do degradê, que muda a cada render. */
const rosto = (html: string) => html.replace(/ceci[^"#)]*-(anel|rosto)/g, "id-$1").replace(/data-estado="[^"]*"/, "");

describe("Ceci", () => {
  it("os quatro estados são desenhos diferentes", () => {
    const desenhos = ESTADOS.map((estado) => rosto(desenhar({ estado })));
    expect(new Set(desenhos).size).toBe(ESTADOS.length);
    for (const estado of ESTADOS) expect(desenhar({ estado }), estado).toContain(`data-estado="${estado}"`);
  });

  it("sem estado, fica parada", () => {
    expect(desenhar()).toContain('data-estado="parada"');
  });

  it("só o pensando gira o anel", () => {
    expect(desenhar({ estado: "pensando" })).toContain("c41-ceci-pensando");
    for (const estado of ESTADOS.filter((e) => e !== "pensando")) expect(desenhar({ estado })).not.toContain("c41-ceci-pensando");
  });

  it("o tamanho vem da prop, num quadrado", () => {
    const html = desenhar({ tamanho: 48 });
    expect(html).toContain('width="48"');
    expect(html).toContain('height="48"');
    expect(html).toContain('viewBox="0 0 120 120"');
  });

  it("é decorativa por padrão e ganha nome com `rotulo`", () => {
    expect(desenhar()).toContain('aria-hidden="true"');
    const comNome = desenhar({ rotulo: "Ceci, assistente do Connect" });
    expect(comNome).toContain('role="img"');
    expect(comNome).toContain('aria-label="Ceci, assistente do Connect"');
    expect(comNome).not.toContain("aria-hidden");
  });

  it("as cores vêm das variáveis do tema, com o tom do logo de reserva", () => {
    const html = desenhar();
    for (const v of ["--c41-ceci-anel-de", "--c41-ceci-anel-ate", "--c41-ceci-no", "--c41-ceci-rosto-de", "--c41-ceci-rosto-ate"]) {
      expect(html).toContain(`var(${v}, #`);
    }
  });

  it("duas Cecis na mesma tela não dividem o id do degradê", () => {
    const html = renderToStaticMarkup(
      React.createElement(React.Fragment, null, React.createElement(Ceci), React.createElement(Ceci, { estado: "pensando" }))
    );
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });
});
