import { describe, expect, it } from "vitest";
import { devolverTitulo, suspenderTitulo, textoDaDica, type ElementoDaDica } from "./dicaDoTitulo";

/** Elemento falso: só atributos e texto, o que a dica lê e mexe. */
function elemento(tag: string, atributos: Record<string, string>, texto = ""): ElementoDaDica & { atributos: Map<string, string> } {
  const mapa = new Map(Object.entries(atributos));
  return {
    atributos: mapa,
    tagName: tag.toUpperCase(),
    textContent: texto,
    getAttribute: (n) => mapa.get(n) ?? null,
    setAttribute: (n, v) => void mapa.set(n, v),
    removeAttribute: (n) => void mapa.delete(n),
    hasAttribute: (n) => mapa.has(n),
  };
}

const nuncaCortado = () => false;
const sempreCortado = () => true;

describe("textoDaDica", () => {
  it("o data-dica vem antes de tudo", () => {
    expect(textoDaDica(elemento("button", { "data-dica": "Mais ações", title: "Outro" }), nuncaCortado)).toBe("Mais ações");
  });

  it("o title vale em qualquer elemento", () => {
    expect(textoDaDica(elemento("span", { title: "Sem filtro aplicado" }), nuncaCortado)).toBe("Sem filtro aplicado");
  });

  it("texto cortado só tem dica quando o corte existe, e cai no texto se não houver title", () => {
    const celula = elemento("span", { class: "block truncate" }, "  Padaria Pão Quente Ltda  ");
    expect(textoDaDica(celula, nuncaCortado)).toBeNull();
    expect(textoDaDica(celula, sempreCortado)).toBe("Padaria Pão Quente Ltda");
    const comTitulo = elemento("span", { class: "truncate", title: "Nome completo" }, "Nome…");
    expect(textoDaDica(comTitulo, sempreCortado)).toBe("Nome completo");
    expect(textoDaDica(comTitulo, nuncaCortado)).toBeNull();
  });

  it("sem nada, sem dica", () => {
    expect(textoDaDica(elemento("div", {}), nuncaCortado)).toBeNull();
  });
});

describe("suspenderTitulo e devolverTitulo", () => {
  it("botão só de ícone: o title era o nome e vira aria-label enquanto a dica está aberta", () => {
    const botao = elemento("button", { title: "Editar" });
    const guardado = suspenderTitulo(botao);
    expect(botao.hasAttribute("title")).toBe(false);
    expect(botao.getAttribute("aria-label")).toBe("Editar");
    devolverTitulo(botao, guardado!);
    expect(botao.getAttribute("title")).toBe("Editar");
    expect(botao.hasAttribute("aria-label")).toBe(false);
  });

  it("elemento com nome: o title era a descrição e vira aria-description", () => {
    const botao = elemento("button", { title: "Bloqueado até a aprovação" }, "Dar baixa");
    const guardado = suspenderTitulo(botao);
    expect(botao.getAttribute("aria-description")).toBe("Bloqueado até a aprovação");
    expect(botao.hasAttribute("aria-label")).toBe(false);
    devolverTitulo(botao, guardado!);
    expect(botao.hasAttribute("aria-description")).toBe(false);
    expect(botao.getAttribute("title")).toBe("Bloqueado até a aprovação");
  });

  it("não repete o nome como descrição, nem pisa numa descrição que já existe", () => {
    const igual = elemento("button", { title: "Copiar CPF", "aria-label": "Copiar CPF" });
    suspenderTitulo(igual);
    expect(igual.hasAttribute("aria-description")).toBe(false);

    const descrito = elemento("button", { title: "Dica", "aria-describedby": "ajuda-1" }, "Salvar");
    suspenderTitulo(descrito);
    expect(descrito.hasAttribute("aria-description")).toBe(false);
  });

  it("o aria-label que o elemento já tinha fica intocado", () => {
    const botao = elemento("button", { title: "Atualizar", "aria-label": "Atualizar notificações" });
    const guardado = suspenderTitulo(botao);
    devolverTitulo(botao, guardado!);
    expect(botao.getAttribute("aria-label")).toBe("Atualizar notificações");
    expect(botao.getAttribute("title")).toBe("Atualizar");
  });

  it("campo de formulário tem nome pelo rótulo: o title vira descrição", () => {
    const campo = elemento("input", { title: "Data de retorno" });
    suspenderTitulo(campo);
    expect(campo.hasAttribute("aria-label")).toBe(false);
    expect(campo.getAttribute("aria-description")).toBe("Data de retorno");
  });

  it("se o React escreveu um title novo no meio-tempo, fica o novo", () => {
    const botao = elemento("button", { title: "Mostrar" });
    const guardado = suspenderTitulo(botao);
    botao.setAttribute("title", "Ocultar");
    devolverTitulo(botao, guardado!);
    expect(botao.getAttribute("title")).toBe("Ocultar");
  });

  it("sem title, nada a suspender", () => {
    expect(suspenderTitulo(elemento("span", { "data-dica": "x" }))).toBeNull();
  });
});
