import { describe, expect, test, vi } from "vitest";
import { lerPagina, paginaNoIntervalo } from "./tela";

// A paginação das abas Regras, Contrapartes e NEO (27/11/2026, melhoria-571).

describe("paginaNoIntervalo", () => {
  test("a pedida vale enquanto existir", () => {
    expect(paginaNoIntervalo(2, 250, 100)).toBe(2);
    expect(paginaNoIntervalo(3, 250, 100)).toBe(3);
  });

  test("além do fim cai na última; lista vazia é a página 1", () => {
    expect(paginaNoIntervalo(9, 250, 100)).toBe(3);
    expect(paginaNoIntervalo(4, 300, 100)).toBe(3);
    expect(paginaNoIntervalo(5, 0, 100)).toBe(1);
  });

  test("zero, negativa, fracionária ou lixo viram número válido", () => {
    expect(paginaNoIntervalo(0, 250, 100)).toBe(1);
    expect(paginaNoIntervalo(-3, 250, 100)).toBe(1);
    expect(paginaNoIntervalo(2.7, 250, 100)).toBe(2);
    expect(paginaNoIntervalo(Number.NaN, 250, 100)).toBe(1);
  });
});

describe("lerPagina", () => {
  test("busca a página pedida com skip e take, uma vez só", async () => {
    const buscar = vi.fn(async (skip: number, take: number) => [`${skip}-${take}`]);
    const r = await lerPagina(2, 100, async () => 250, buscar);
    expect(r).toEqual({ itens: ["100-100"], total: 250, pagina: 2 });
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  test("página além do fim busca de novo a última", async () => {
    const buscar = vi.fn(async (skip: number) => (skip >= 300 ? [] : [`a partir de ${skip}`]));
    const r = await lerPagina(7, 100, async () => 250, buscar);
    expect(r).toEqual({ itens: ["a partir de 200"], total: 250, pagina: 3 });
    expect(buscar).toHaveBeenNthCalledWith(1, 600, 100);
    expect(buscar).toHaveBeenNthCalledWith(2, 200, 100);
  });

  test("recorte vazio fica na página 1, sem segunda leitura", async () => {
    const buscar = vi.fn(async () => [] as string[]);
    const r = await lerPagina(1, 500, async () => 0, buscar);
    expect(r).toEqual({ itens: [], total: 0, pagina: 1 });
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});
