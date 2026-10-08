import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

// O HTML do servidor: é o que vai para a tela antes do JS, e o que o form GET
// das páginas de servidor envia mesmo sem ele.
function html(props: Parameters<typeof Select>[0]): string {
  return renderToStaticMarkup(h(Select, props));
}

const UFS: ReactNode = [
  h("option", { key: "", value: "", disabled: true }, "Selecione…"),
  h("option", { key: "SC", value: "SC" }, "Santa Catarina"),
  h("option", { key: "SP", value: "SP" }, "São Paulo"),
];

function selectEscondido(markup: string): string {
  return /<select[^>]*>[\s\S]*<\/select>/.exec(markup)![0];
}

function gatilho(markup: string): string {
  return /<button[\s\S]*<\/button>/.exec(markup)![0];
}

describe("Select — o <select> escondido", () => {
  it("leva name, required, o valor inicial e as mesmas opções para o formulário", () => {
    const sel = selectEscondido(html({ name: "uf", required: true, defaultValue: "SP", children: UFS }));
    expect(sel).toMatch(/name="uf"/);
    expect(sel).toMatch(/required=""/);
    expect(sel).toMatch(/hidden=""/);
    expect(sel).toMatch(/tabindex="-1"/);
    expect(sel).toMatch(/<option value="SP" selected="">São Paulo<\/option>/);
    expect(sel).toMatch(/<option value="" disabled="">Selecione…<\/option>/);
  });

  it("mantém o optgroup", () => {
    const sel = selectEscondido(
      html({
        name: "centro",
        value: "b",
        onChange: () => {},
        children: [
          h("option", { key: "0", value: "" }, "Sem centro de custo"),
          h("optgroup", { key: "g", label: "Empresa X" }, h("option", { value: "b" }, "Centro B")),
        ],
      })
    );
    expect(sel).toMatch(/<optgroup label="Empresa X"><option value="b" selected="">Centro B<\/option><\/optgroup>/);
  });

  it("aponta o gatilho no data-c41-foco (o balão de validação vai nele)", () => {
    const markup = html({ id: "uf", name: "uf", children: UFS });
    expect(selectEscondido(markup)).toMatch(/data-c41-foco="uf"/);
    expect(selectEscondido(markup)).not.toMatch(/ id="uf"/);
  });

  it("disabled vale nos dois", () => {
    const markup = html({ name: "uf", disabled: true, children: UFS });
    expect(markup).toMatch(/<select[^>]*disabled=""/);
    expect(gatilho(markup)).toMatch(/<button[^>]*disabled=""/);
  });
});

describe("Select — o gatilho", () => {
  it("recebe o id (o label htmlFor aponta para ele), o papel de combobox e o aria-label", () => {
    const g = gatilho(html({ id: "kind", "aria-label": "Tipo", name: "kind", required: true, children: UFS }));
    expect(g).toMatch(/id="kind"/);
    expect(g).toMatch(/role="combobox"/);
    expect(g).toMatch(/aria-expanded="false"/);
    expect(g).toMatch(/aria-haspopup="listbox"/);
    expect(g).toMatch(/aria-label="Tipo"/);
    expect(g).toMatch(/aria-required="true"/);
  });

  it("mostra o rótulo da escolhida — controlada ou não", () => {
    expect(gatilho(html({ defaultValue: "SC", children: UFS }))).toMatch(/>Santa Catarina</);
    expect(gatilho(html({ value: "SP", onChange: () => {}, children: UFS }))).toMatch(/>São Paulo</);
  });

  it("a opção de valor vazio aparece apagada, como placeholder", () => {
    const g = gatilho(html({ defaultValue: "", children: UFS }));
    expect(g).toMatch(/<span class="[^"]*text-fg-muted[^"]*">Selecione…<\/span>/);
  });

  it("sem valor, mostra a primeira habilitada, como o navegador", () => {
    expect(gatilho(html({ children: UFS }))).toMatch(/truncate\s*">Santa Catarina</);
  });

  it("reserva a largura da maior opção", () => {
    expect(gatilho(html({ defaultValue: "SC", children: UFS }))).toMatch(/invisible[^"]*">Santa Catarina</);
  });

  it("compact e error mudam altura e borda", () => {
    expect(gatilho(html({ compact: true, children: UFS }))).toMatch(/h-8 text-ui/);
    expect(gatilho(html({ children: UFS }))).toMatch(/h-9 text-input/);
    expect(gatilho(html({ error: true, children: UFS }))).toMatch(/border-danger/);
    expect(gatilho(html({ error: true, children: UFS }))).toMatch(/aria-invalid="true"/);
  });

  it("className vai no invólucro, para a largura (w-44, w-auto)", () => {
    expect(html({ className: "w-44", children: UFS })).toMatch(/^<div class="relative w-44">/);
  });

  it("o painel só existe aberto", () => {
    expect(html({ children: UFS })).not.toMatch(/role="listbox"/);
  });
});
