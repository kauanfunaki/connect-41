import { describe, expect, it } from "vitest";
import type { ActionState } from "@/lib/actionState";
import { criarFilaDeGravacao } from "./filaDeGravacao";

/** Uma action que só termina quando o teste manda, e anota quando começou. */
function actionNaMao(nome: string, diario: string[]) {
  let terminar!: (r: ActionState) => void;
  const fim = new Promise<ActionState>((ok) => (terminar = ok));
  return {
    pedido: () => {
      diario.push(nome);
      return fim;
    },
    terminar,
  };
}

const passo = () => new Promise<void>((ok) => setTimeout(ok, 0));

describe("fila de gravação do Configurar do Meu dia", () => {
  it("grava uma por vez: a segunda só começa quando a primeira volta", async () => {
    const diario: string[] = [];
    const gravar = criarFilaDeGravacao();
    const a = actionNaMao("a", diario);
    const b = actionNaMao("b", diario);

    const fimDeA = gravar(a.pedido);
    const fimDeB = gravar(b.pedido);
    await passo();
    expect(diario).toEqual(["a"]);

    a.terminar(null);
    await passo();
    expect(diario).toEqual(["a", "b"]);

    b.terminar(null);
    expect(await fimDeA).toEqual({ ok: true });
    expect(await fimDeB).toEqual({ ok: true });
  });

  it("com uma em curso, envia só o pedido mais recente", async () => {
    const diario: string[] = [];
    const gravar = criarFilaDeGravacao();
    const a = actionNaMao("a", diario);
    const b = actionNaMao("b", diario);
    const c = actionNaMao("c", diario);

    const fins = [gravar(a.pedido), gravar(b.pedido), gravar(c.pedido)];
    a.terminar(null);
    await passo();
    c.terminar(null);

    expect(await Promise.all(fins)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(diario).toEqual(["a", "c"]);
  });

  it("no erro, descarta o que esperava e avisa só quem fez o pedido que falhou", async () => {
    const diario: string[] = [];
    const gravar = criarFilaDeGravacao();
    const a = actionNaMao("a", diario);
    const b = actionNaMao("b", diario);

    const fimDeA = gravar(a.pedido);
    const fimDeB = gravar(b.pedido);
    a.terminar({ error: "Sem permissão." });

    expect(await fimDeA).toEqual({ ok: false, erro: "Sem permissão." });
    expect(await fimDeB).toEqual({ ok: false, erro: null });
    expect(diario).toEqual(["a"]);
  });

  it("a action que estoura vira erro, e a fila segue servindo depois", async () => {
    const gravar = criarFilaDeGravacao();
    const fim = await gravar(() => Promise.reject(new Error("rede")));
    expect(fim).toEqual({ ok: false, erro: "Não foi possível gravar. Tente de novo." });

    expect(await gravar(() => Promise.resolve(null))).toEqual({ ok: true });
  });
});
