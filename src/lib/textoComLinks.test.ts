import { describe, it, expect } from "vitest";
import { partesComLinks } from "./textoComLinks";

describe("partesComLinks", () => {
  it("separa o endereço do cartão na primeira linha da importação", () => {
    const texto = "Importado do Trello em 06/10/2026 — https://trello.com/c/AbC123\nCartão: Ótica";
    expect(partesComLinks(texto)).toEqual([
      { tipo: "texto", texto: "Importado do Trello em 06/10/2026 — " },
      { tipo: "link", url: "https://trello.com/c/AbC123" },
      { tipo: "texto", texto: "\nCartão: Ótica" },
    ]);
  });

  it("a pontuação do fim da frase fica fora do link", () => {
    expect(partesComLinks("veja https://exemplo.com.br/a.")).toEqual([
      { tipo: "texto", texto: "veja " },
      { tipo: "link", url: "https://exemplo.com.br/a" },
      { tipo: "texto", texto: "." },
    ]);
    expect(partesComLinks("(https://exemplo.com.br)")[1]).toEqual({ tipo: "link", url: "https://exemplo.com.br" });
  });

  it("só http e https viram link", () => {
    expect(partesComLinks("javascript:alert(1) ftp://x.y")).toEqual([
      { tipo: "texto", texto: "javascript:alert(1) ftp://x.y" },
    ]);
  });

  it("texto sem endereço sai inteiro, e vazio sai vazio", () => {
    expect(partesComLinks("nada aqui")).toEqual([{ tipo: "texto", texto: "nada aqui" }]);
    expect(partesComLinks("")).toEqual([]);
  });

  it("mais de um endereço no mesmo texto", () => {
    const partes = partesComLinks("a http://um.com b https://dois.com");
    expect(partes.filter((p) => p.tipo === "link")).toHaveLength(2);
  });
});
