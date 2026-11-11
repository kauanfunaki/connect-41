import { describe, expect, it } from "vitest";
import { juntarAnexos } from "./juntarAnexos";

const MB = 1024 * 1024;
const regras = { accept: ".pdf,.png,.jpg,.jpeg,.xml", maxBytes: 10 * MB, maximo: 3 };
const arq = (name: string, size = 1000, lastModified = 1) => ({ name, size, lastModified });

describe("juntarAnexos — vários arquivos num campo só (11/11/2026)", () => {
  it("soma a escolha nova às de antes, na ordem", () => {
    const r = juntarAnexos([arq("a.pdf")], [arq("b.png"), arq("c.xml")], regras);
    expect(r.arquivos.map((a) => a.name)).toEqual(["a.pdf", "b.png", "c.xml"]);
    expect(r.recusados).toEqual([]);
  });

  it("o mesmo arquivo escolhido de novo não se repete, e não é erro", () => {
    const r = juntarAnexos([arq("a.pdf")], [arq("a.pdf")], regras);
    expect(r.arquivos).toHaveLength(1);
    expect(r.recusados).toEqual([]);
    // Mesmo nome, outro arquivo (tamanho diferente): entra.
    expect(juntarAnexos([arq("a.pdf")], [arq("a.pdf", 2000)], regras).arquivos).toHaveLength(2);
  });

  it("recusa formato e tamanho, dizendo o motivo de cada um", () => {
    const r = juntarAnexos([], [arq("nota.docx"), arq("grande.pdf", 11 * MB), arq("ok.jpg")], regras);
    expect(r.arquivos.map((a) => a.name)).toEqual(["ok.jpg"]);
    expect(r.recusados).toEqual(["nota.docx: formato não aceito.", "grande.pdf: 11 MB, acima do limite de 10 MB."]);
  });

  it("passa do limite: os que sobram ficam de fora, com o limite na frase", () => {
    const r = juntarAnexos([arq("1.pdf"), arq("2.pdf")], [arq("3.pdf"), arq("4.pdf")], regras);
    expect(r.arquivos.map((a) => a.name)).toEqual(["1.pdf", "2.pdf", "3.pdf"]);
    expect(r.recusados).toEqual(["4.pdf: ficou de fora, o limite é de 3 arquivos por envio."]);
  });
});
