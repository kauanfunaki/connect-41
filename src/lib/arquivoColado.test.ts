import { describe, expect, it } from "vitest";
import { arquivosDaColagem, nomeDoArquivoColado } from "./arquivoColado";

const arquivo = (nome: string) => new File(["x"], nome, { type: "image/png" });

describe("arquivosDaColagem", () => {
  it("print sozinho vira anexo", () => {
    const f = arquivo("image.png");
    expect(arquivosDaColagem([f], "")).toEqual([f]);
  });
  it("colagem com texto fica para o campo", () => {
    expect(arquivosDaColagem([arquivo("image.png")], "trecho copiado")).toEqual([]);
  });
  it("texto puro não vira nada", () => {
    expect(arquivosDaColagem([], "texto")).toEqual([]);
  });
});

describe("nomeDoArquivoColado", () => {
  const quando = new Date(2026, 10, 5, 14, 7);
  it("o print genérico ganha data e hora", () => {
    expect(nomeDoArquivoColado("image.png", quando)).toBe("print 05-11-2026 14h07.png");
  });
  it("o segundo do mesmo minuto ganha o número", () => {
    expect(nomeDoArquivoColado("image.PNG", quando, 2)).toBe("print 05-11-2026 14h07 (2).png");
  });
  it("arquivo com nome de verdade fica como veio", () => {
    expect(nomeDoArquivoColado("relatorio.pdf", quando, 3)).toBe("relatorio.pdf");
  });
});
