import { describe, expect, it } from "vitest";

import { estruturaDe } from "./estrutura";

describe("estruturaDe", () => {
  it("resume objetos e listas pelo primeiro item, com o caminho de cada campo", () => {
    const e = estruturaDe({
      pagina: 1,
      nfCadastro: [
        { compl: { cChaveNFe: "4125" }, ide: { nNF: "123", dEmi: "01/09/2026" }, total: { ICMSTot: { vNF: 150.5 } } },
        { compl: { cChaveNFe: "outra" } },
      ],
      vazio: null,
    });
    expect(e).toEqual([
      { caminho: "pagina", tipo: "number", exemplo: "1" },
      { caminho: "nfCadastro", tipo: "lista[2]", exemplo: "" },
      { caminho: "nfCadastro[0].compl.cChaveNFe", tipo: "string", exemplo: "4125" },
      { caminho: "nfCadastro[0].ide.nNF", tipo: "string", exemplo: "123" },
      { caminho: "nfCadastro[0].ide.dEmi", tipo: "string", exemplo: "01/09/2026" },
      { caminho: "nfCadastro[0].total.ICMSTot.vNF", tipo: "number", exemplo: "150.5" },
      { caminho: "vazio", tipo: "null", exemplo: "" },
    ]);
  });

  it("corta texto longo e para em 200 linhas", () => {
    expect(estruturaDe({ x: "a".repeat(100) })[0].exemplo).toHaveLength(58);
    const grande = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`c${i}`, i]));
    expect(estruturaDe(grande)).toHaveLength(200);
  });
});
