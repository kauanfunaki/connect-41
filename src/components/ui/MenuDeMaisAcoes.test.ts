import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MenuDeMaisAcoes } from "./MenuDeMaisAcoes";
import { ItemDoMenu } from "./Popover";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
const item = (texto: string, disabled = false) => {
  const props = { children: texto, disabled, danger: true };
  return React.createElement(ItemDoMenu, props);
};
const render = (children: React.ComponentProps<typeof MenuDeMaisAcoes>["children"]) => renderToStaticMarkup(React.createElement(MenuDeMaisAcoes, null, children as React.ReactNode));

describe("menus de ações", () => {
  it("mostra ação única diretamente, mesmo em agrupadores e condições", () => {
    const html = render(() => React.createElement("div", null, React.createElement(React.Fragment, null, false, item("Excluir"))));
    expect(html).toContain("Excluir");
    expect(html).not.toContain("Mais ações");
  });
  it("mantém ação única desabilitada", () => {
    expect(render(item("Inativar", true))).toContain('disabled=""');
  });
  it("mantém menu quando há duas ações", () => {
    expect(render(React.createElement(React.Fragment, null, item("Excluir"), item("Inativar")))).toContain("Mais ações");
  });
  it("não mostra menu vazio", () => {
    expect(render(null)).toBe("");
  });
});
