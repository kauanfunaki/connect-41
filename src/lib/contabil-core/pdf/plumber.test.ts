// Gabarito do agrupamento do pdfplumber (scripts/contabil-core/gabarito_plumber.py).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extrairPalavras, extrairTexto, type Caractere } from "./plumber";

type Pagina = {
  chars: Caractere[];
  texto: string;
  palavras: { text: string; x0: number; x1: number; top: number; bottom: number; upright: boolean }[];
  palavras_com_chars: { text: string; chars: string[] }[];
};
const paginas: Pagina[] = JSON.parse(readFileSync(join(__dirname, "gabarito", "plumber.json"), "utf8"));

describe("pdfplumber: palavras e texto da página", () => {
  paginas.forEach((p, i) => {
    it(`página ${i + 1}`, () => {
      expect(extrairTexto(p.chars)).toBe(p.texto);
      const palavras = extrairPalavras(p.chars);
      expect(palavras.map(({ text, x0, x1, top, bottom, upright }) => ({ text, x0, x1, top, bottom, upright }))).toEqual(
        p.palavras.map(({ text, x0, x1, top, bottom, upright }) => ({ text, x0, x1, top, bottom, upright })),
      );
      expect(extrairPalavras(p.chars, true).map((w) => ({ text: w.text, chars: w.chars!.map((c) => c.text) }))).toEqual(
        p.palavras_com_chars.map((w) => ({ text: w.text, chars: w.chars })),
      );
    });
  });
});
