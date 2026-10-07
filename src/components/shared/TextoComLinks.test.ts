import { describe, expect, it } from "vitest";
import { separarLinks } from "./TextoComLinks";

describe("separarLinks", () => {
  it("acha o endereço no meio do texto", () => {
    expect(separarLinks("Importado do Trello em 03/10 — https://trello.com/c/AbC123 (abra para baixar)")).toEqual([
      { texto: "Importado do Trello em 03/10 — " },
      { url: "https://trello.com/c/AbC123" },
      { texto: " (abra para baixar)" },
    ]);
  });

  it("não leva a pontuação do fim da frase", () => {
    expect(separarLinks("Veja https://exemplo.com.br/a?b=1.")).toEqual([{ texto: "Veja " }, { url: "https://exemplo.com.br/a?b=1" }, { texto: "." }]);
  });

  it("texto sem endereço volta inteiro", () => {
    expect(separarLinks("Sem link aqui")).toEqual([{ texto: "Sem link aqui" }]);
    expect(separarLinks("")).toEqual([]);
  });

  it("mais de um endereço, e linha nova no meio", () => {
    expect(separarLinks("a http://x.io\nb https://y.io/z")).toEqual([
      { texto: "a " },
      { url: "http://x.io" },
      { texto: "\nb " },
      { url: "https://y.io/z" },
    ]);
  });
});
