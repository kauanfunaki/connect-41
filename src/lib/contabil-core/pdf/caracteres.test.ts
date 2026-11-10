// O intérprete de caracteres sobre um PDF inventado (scripts/contabil-core/gabarito_pdf_ficticio.py):
// o texto e as palavras precisam sair como os do pdfplumber, com Tc, Tw, Tz, TJ, T*, ', Ts, q/Q,
// formulário e página girada.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { caracteresDoPdf, LimiteDePaginas } from "./caracteres";
import { extrairPalavras, extrairTexto } from "./plumber";

type Esperado = { texto: string; palavras: { text: string; x0: number; x1: number; top: number; bottom: number; upright: boolean }[] };
const pdf = readFileSync(join(__dirname, "gabarito", "extrato-ficticio.pdf"));
const esperado: Esperado[] = JSON.parse(readFileSync(join(__dirname, "gabarito", "extrato-ficticio.json"), "utf8"));

// O pdf.js entrega a matriz do texto em precisão simples (Float32): a posição difere da do pdfminer
// em menos de 0,0001 ponto, longe das tolerâncias de 3 pontos do agrupamento.
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-3;

describe("caracteres do PDF como o pdfminer", () => {
  it("texto e palavras iguais aos do pdfplumber", async () => {
    const paginas = await caracteresDoPdf(new Uint8Array(pdf));
    expect(paginas).toHaveLength(esperado.length);
    paginas.forEach((p, i) => {
      expect(extrairTexto(p.caracteres)).toBe(esperado[i].texto);
      const palavras = extrairPalavras(p.caracteres);
      expect(palavras.map((w) => w.text)).toEqual(esperado[i].palavras.map((w) => w.text));
      palavras.forEach((w, k) => {
        const e = esperado[i].palavras[k];
        expect(perto(w.x0, e.x0) && perto(w.x1, e.x1) && perto(w.top, e.top) && perto(w.bottom, e.bottom), `${w.text} p${i + 1}`).toBe(true);
        expect(w.upright).toBe(e.upright);
      });
    });
  });

  it("recusa PDF acima do limite de páginas", async () => {
    await expect(caracteresDoPdf(new Uint8Array(pdf), { maxPaginas: 1 })).rejects.toBeInstanceOf(LimiteDePaginas);
  });

  it("não deixa o buffer de quem chamou inutilizado", async () => {
    const bytes = new Uint8Array(pdf);
    await caracteresDoPdf(bytes);
    expect(bytes.byteLength).toBe(pdf.byteLength);
  });
});
