import { describe, expect, it } from "vitest";
import { conversasNaFila, esperar, naFila } from "./fila";

describe("naFila", () => {
  it("atende uma de cada vez, na ordem de chegada, dentro da mesma conversa", async () => {
    const ordem: string[] = [];
    const a = naFila("t1", async () => {
      await esperar(30);
      ordem.push("a");
    });
    const b = naFila("t1", async () => {
      ordem.push("b");
    });
    await Promise.all([a, b]);
    expect(ordem).toEqual(["a", "b"]);
  });

  it("conversas diferentes não esperam uma pela outra", async () => {
    const ordem: string[] = [];
    const lenta = naFila("t2", async () => {
      await esperar(30);
      ordem.push("lenta");
    });
    const rapida = naFila("t3", async () => {
      ordem.push("rapida");
    });
    await Promise.all([lenta, rapida]);
    expect(ordem).toEqual(["rapida", "lenta"]);
  });

  it("um trabalho que falha não trava o seguinte, e o erro volta para quem chamou", async () => {
    const falha = naFila("t4", async () => {
      throw new Error("provedor fora");
    });
    const seguinte = naFila("t4", async () => "ok");
    await expect(falha).rejects.toThrow("provedor fora");
    await expect(seguinte).resolves.toBe("ok");
  });

  it("a conversa sai do mapa quando a fila esvazia", async () => {
    await naFila("t5", async () => undefined);
    await esperar(0);
    expect(conversasNaFila()).toBe(0);
  });
});
