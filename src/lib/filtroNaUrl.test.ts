import { describe, expect, it } from "vitest";
import { lerLista } from "./filtroNaUrl";

describe("lerLista", () => {
  it("aceita ausente, um valor e valor repetido", () => {
    expect(lerLista(undefined)).toEqual([]);
    expect(lerLista("a")).toEqual(["a"]);
    expect(lerLista(["a", "b"])).toEqual(["a", "b"]);
  });
});
