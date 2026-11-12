// O texto do PyMuPDF imitado a partir dos caracteres do pdfminer (`mupdf.ts`), contra o que o PyMuPDF
// tirou de cada PDF do gabarito do financeiro (scripts/contabil-core/gabarito_financeiro.py): o texto
// de cada página igual, e as palavras na mesma ordem, com o mesmo texto e a caixa a até 0,02 ponto
// (o MuPDF conta em precisão simples).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { caracteresDoPdf } from "./caracteres";
import { palavrasMupdf, textoMupdf } from "./mupdf";

const PASTA = join(__dirname, "..", "conciliacao", "gabarito");
type Pagina = { texto: string; palavras: [number, number, number, number, string][] };
const esperado: Record<string, Pagina[]> = JSON.parse(readFileSync(join(PASTA, "mupdf-paginas.json"), "utf8"));

describe("palavras e texto como o PyMuPDF", () => {
  it("o gabarito tem os PDFs do financeiro", () => {
    expect(Object.keys(esperado).length).toBeGreaterThanOrEqual(80);
  });

  for (const [arquivo, paginas] of Object.entries(esperado)) {
    it(arquivo, async () => {
      const lidas = await caracteresDoPdf(new Uint8Array(readFileSync(join(PASTA, arquivo))));
      expect(lidas).toHaveLength(paginas.length);
      lidas.forEach((p, i) => {
        expect(textoMupdf(p.caracteres, p.largura, p.altura)).toBe(paginas[i].texto);
        const palavras = palavrasMupdf(p.caracteres, p.largura, p.altura);
        expect(palavras.map((w) => w.text)).toEqual(paginas[i].palavras.map((w) => w[4]));
        palavras.forEach((w, k) => {
          const [x0, top, x1, bottom] = paginas[i].palavras[k];
          const perto = [w.x0 - x0, w.top - top, w.x1 - x1, w.bottom - bottom].every((d) => Math.abs(d) < 0.02);
          expect(perto, `${w.text} p${i + 1}: ${JSON.stringify([w.x0, w.top, w.x1, w.bottom])} × ${JSON.stringify([x0, top, x1, bottom])}`).toBe(true);
        });
      });
    });
  }
});
