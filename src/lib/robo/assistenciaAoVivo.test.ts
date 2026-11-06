import { describe, expect, it } from "vitest";
import { enfileirarClique, esquecerSessao, guardarQuadro, retirarCliques, ultimoQuadro } from "./assistenciaAoVivo";

const quadro = (em: Date) => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), tipo: "image/jpeg", em });

describe("memória da sessão assistida", () => {
  it("guarda só o último quadro de cada tarefa", () => {
    const a = new Date("2026-11-06T14:00:00Z");
    const b = new Date("2026-11-06T14:00:01Z");
    guardarQuadro("t-quadro", quadro(a));
    guardarQuadro("t-quadro", quadro(b));
    expect(ultimoQuadro("t-quadro")?.em).toEqual(b);
    expect(ultimoQuadro("outra")).toBeNull();
    esquecerSessao("t-quadro");
    expect(ultimoQuadro("t-quadro")).toBeNull();
  });

  it("entrega os cliques na ordem e esvazia a fila", () => {
    const em = new Date("2026-11-06T14:00:00Z");
    enfileirarClique("t-clique", { x: 0.1, y: 0.2, userId: "u1", em });
    enfileirarClique("t-clique", { x: 0.3, y: 0.4, userId: "u2", em });
    expect(retirarCliques("t-clique").map((c) => [c.x, c.y, c.userId])).toEqual([[0.1, 0.2, "u1"], [0.3, 0.4, "u2"]]);
    expect(retirarCliques("t-clique")).toEqual([]);
  });

  it("a fila não cresce sem limite: ficam os 20 mais novos", () => {
    const em = new Date("2026-11-06T14:00:00Z");
    for (let i = 0; i < 30; i++) enfileirarClique("t-muitos", { x: i / 100, y: 0, userId: "u1", em });
    const fila = retirarCliques("t-muitos");
    expect(fila).toHaveLength(20);
    expect(fila[0].x).toBe(0.1);
    expect(fila[19].x).toBe(0.29);
  });

  it("esquece a sessão que ficou 30 min sem quadro (máquina desligada no meio)", () => {
    const antes = new Date("2026-11-06T14:00:00Z");
    const depois = new Date("2026-11-06T14:31:00Z");
    guardarQuadro("t-velha", quadro(antes));
    enfileirarClique("t-velha", { x: 0.5, y: 0.5, userId: "u1", em: antes });
    guardarQuadro("t-nova", quadro(depois));
    expect(ultimoQuadro("t-velha")).toBeNull();
    expect(retirarCliques("t-velha")).toEqual([]);
    expect(ultimoQuadro("t-nova")).not.toBeNull();
    esquecerSessao("t-nova");
  });
});
