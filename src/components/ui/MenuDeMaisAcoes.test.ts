import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MenuDeMaisAcoes } from "./MenuDeMaisAcoes";
import { ItemDoMenu } from "./Popover";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
const item = (texto: string, { disabled = false, danger = false } = {}) => {
  const props = { children: texto, disabled, danger };
  return React.createElement(ItemDoMenu, props);
};
const render = (children: React.ComponentProps<typeof MenuDeMaisAcoes>["children"]) => renderToStaticMarkup(React.createElement(MenuDeMaisAcoes, null, children as React.ReactNode));

describe("menus de ações", () => {
  it("mostra ação única diretamente, mesmo em agrupadores e condições", () => {
    const html = render(() => React.createElement("div", null, React.createElement(React.Fragment, null, false, item("Reativar"))));
    expect(html).toContain("Reativar");
    expect(html).not.toContain("Mais ações");
  });
  it("mantém ação única desabilitada", () => {
    expect(render(item("Reativar", { disabled: true }))).toContain('disabled=""');
  });
  it("mantém no ⋯ a ação única que apaga ou encerra (D3)", () => {
    const sozinha = render(item("Excluir", { danger: true }));
    expect(sozinha).toContain("Mais ações");
    expect(sozinha).not.toContain("Excluir");
    const agrupada = render(() => React.createElement("div", null, React.createElement(React.Fragment, null, false, item("Inativar", { danger: true }))));
    expect(agrupada).toContain("Mais ações");
    expect(agrupada).not.toContain("Inativar");
  });
  it("permite manter uma consulta secundária recolhida sem alterar o padrão", () => {
    // O terceiro argumento fornece children; os tipos do React ainda o exigem em props.
    const props = { sempreMenu: true } as React.ComponentProps<typeof MenuDeMaisAcoes>;
    const html = renderToStaticMarkup(React.createElement(MenuDeMaisAcoes, props, item("Ver relatório")));
    expect(html).toContain("Mais ações");
    expect(html).not.toContain("Ver relatório");
    expect(render(item("Ver relatório"))).toContain("Ver relatório");
  });
  it("mantém menu quando há duas ações", () => {
    expect(render(React.createElement(React.Fragment, null, item("Reativar"), item("Excluir", { danger: true })))).toContain("Mais ações");
  });
  it("não mostra menu vazio", () => {
    expect(render(null)).toBe("");
  });
});
