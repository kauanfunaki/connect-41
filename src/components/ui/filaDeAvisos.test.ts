import { describe, expect, it } from "vitest";
import { DURACAO_DO_AVISO, DURACAO_DO_CLICAVEL, MAXIMO_POR_GRUPO, duracaoDoAviso, entrarNaFila } from "./filaDeAvisos";

type A = { id: number; grupo?: string };

describe("entrarNaFila (os avisos do canto)", () => {
  it("sem grupo, entra no fim e ninguém sai — quem já usava o Toast não muda", () => {
    const fila: A[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(entrarNaFila(fila, { id: 5 }).map((a) => a.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it("no mesmo grupo, no máximo 3: o mais antigo do grupo sai", () => {
    const fila: A[] = [{ id: 1, grupo: "n" }, { id: 2 }, { id: 3, grupo: "n" }, { id: 4, grupo: "n" }];
    expect(MAXIMO_POR_GRUPO).toBe(3);
    expect(entrarNaFila(fila, { id: 5, grupo: "n" }).map((a) => a.id)).toEqual([2, 3, 4, 5]);
  });
  it("abaixo do máximo, ninguém sai", () => {
    const fila: A[] = [{ id: 1, grupo: "n" }];
    expect(entrarNaFila(fila, { id: 2, grupo: "n" }).map((a) => a.id)).toEqual([1, 2]);
  });
  it("outro grupo não conta", () => {
    const fila: A[] = [{ id: 1, grupo: "x" }, { id: 2, grupo: "x" }, { id: 3, grupo: "x" }];
    expect(entrarNaFila(fila, { id: 4, grupo: "n" }).map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("duracaoDoAviso", () => {
  it("o clicável fica mais que o comum; o de erro não encurta", () => {
    expect(duracaoDoAviso("info", false)).toBe(DURACAO_DO_AVISO.info);
    expect(duracaoDoAviso("info", true)).toBe(DURACAO_DO_CLICAVEL);
    expect(DURACAO_DO_CLICAVEL).toBeGreaterThan(DURACAO_DO_AVISO.info);
    expect(duracaoDoAviso("error", true)).toBe(Math.max(DURACAO_DO_AVISO.error, DURACAO_DO_CLICAVEL));
  });
});
