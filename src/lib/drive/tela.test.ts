import { describe, expect, it } from "vitest";
import { enderecoDaPasta, paginaPedida, paginaValida, totalDePaginas } from "./tela";

describe("paginaPedida", () => {
  it("lê o ?pagina= da URL; lixo, zero e negativo são a primeira", () => {
    expect(paginaPedida("3")).toBe(3);
    expect(paginaPedida(undefined)).toBe(1);
    expect(paginaPedida("abc")).toBe(1);
    expect(paginaPedida("0")).toBe(1);
    expect(paginaPedida("-2")).toBe(1);
    expect(paginaPedida("2.7")).toBe(2);
    expect(paginaPedida("Infinity")).toBe(1);
  });
});

describe("paginaValida", () => {
  it("mantém a página pedida quando ela existe", () => {
    expect(paginaValida(2, 250, 100)).toBe(2);
    expect(paginaValida(3, 250, 100)).toBe(3);
  });

  it("página além do fim cai na última — o último arquivo da última página foi para a lixeira", () => {
    expect(paginaValida(3, 200, 100)).toBe(2);
    expect(paginaValida(99, 250, 100)).toBe(3);
  });

  it("pasta sem arquivos é a página 1", () => {
    expect(paginaValida(4, 0, 100)).toBe(1);
  });

  it("página inválida vira a primeira", () => {
    expect(paginaValida(0, 250, 100)).toBe(1);
    expect(paginaValida(Number.NaN, 250, 100)).toBe(1);
  });
});

describe("totalDePaginas", () => {
  it("arredonda para cima e nunca dá zero", () => {
    expect(totalDePaginas({ pagina: 1, total: 101, porPagina: 100 })).toBe(2);
    expect(totalDePaginas({ pagina: 1, total: 100, porPagina: 100 })).toBe(1);
    expect(totalDePaginas({ pagina: 1, total: 0, porPagina: 50 })).toBe(1);
  });
});

describe("enderecoDaPasta com página", () => {
  it("leva a pasta e a página; sem página, abre na primeira", () => {
    expect(enderecoDaPasta("/arquivos/internas", "p1", { pagina: "2" })).toBe("/arquivos/internas?pagina=2&pasta=p1");
    expect(enderecoDaPasta("/arquivos/internas", "p1")).toBe("/arquivos/internas?pasta=p1");
  });
});
