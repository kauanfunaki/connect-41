import { describe, expect, it } from "vitest";
import { alturaDaLinha, destinoDoBloco, indiceDeInsercao, virouArraste } from "./arrasteDeBlocos";

// Três blocos de 20 px, com 10 px entre eles: 0–20, 30–50, 60–80.
const blocos = [{ top: 0, height: 20 }, { top: 30, height: 20 }, { top: 60, height: 20 }];

describe("arrastar blocos do editor", () => {
  it("abaixo do limiar é clique; acima, arraste", () => {
    expect(virouArraste(2, 2)).toBe(false);
    expect(virouArraste(0, 4)).toBe(true);
  });

  it("entra antes do primeiro bloco cuja metade fica abaixo do ponteiro", () => {
    expect(indiceDeInsercao(blocos, -5)).toBe(0);
    expect(indiceDeInsercao(blocos, 9)).toBe(0);
    expect(indiceDeInsercao(blocos, 11)).toBe(1);
    expect(indiceDeInsercao(blocos, 45)).toBe(2);
    expect(indiceDeInsercao(blocos, 75)).toBe(3);
    expect(indiceDeInsercao([], 10)).toBe(0);
  });

  it("a linha fica no topo do bloco de destino, ou no pé do último", () => {
    expect(alturaDaLinha(blocos, 0)).toBe(0);
    expect(alturaDaLinha(blocos, 2)).toBe(60);
    expect(alturaDaLinha(blocos, 3)).toBe(80);
    expect(alturaDaLinha([], 0)).toBeNull();
  });

  it("do índice de inserção para o destino do bloco; perto de si mesmo, não move", () => {
    expect(destinoDoBloco(1, 1)).toBeNull();
    expect(destinoDoBloco(1, 2)).toBeNull();
    expect(destinoDoBloco(1, 0)).toBe(0);
    expect(destinoDoBloco(0, 3)).toBe(2);
    expect(destinoDoBloco(2, 0)).toBe(0);
  });
});
