import { describe, expect, it } from "vitest";
import { moverNaLista, ordemValida } from "./ordem";

describe("moverNaLista", () => {
  it("leva o item para a posição pedida, para cima e para baixo", () => {
    expect(moverNaLista(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moverNaLista(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("fora dos limites ou no mesmo lugar, devolve a mesma ordem numa cópia", () => {
    const lista = ["a", "b"];
    expect(moverNaLista(lista, 0, 0)).toEqual(["a", "b"]);
    expect(moverNaLista(lista, -1, 1)).toEqual(["a", "b"]);
    expect(moverNaLista(lista, 0, 2)).toEqual(["a", "b"]);
    expect(moverNaLista(lista, 0, 0)).not.toBe(lista);
  });
});

describe("ordemValida", () => {
  it("aceita os mesmos campos em outra ordem", () => {
    expect(ordemValida(["c", "a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("recusa campo a mais, a menos, repetido ou de outro grupo", () => {
    expect(ordemValida(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(ordemValida(["a", "b", "c", "d"], ["a", "b", "c"])).toBe(false);
    expect(ordemValida(["a", "a", "b"], ["a", "b", "c"])).toBe(false);
    expect(ordemValida(["a", "b", "x"], ["a", "b", "c"])).toBe(false);
  });
});
