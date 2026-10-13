import { afterEach, describe, expect, it } from "vitest";

import { ErroDoOmie } from "./cliente";
import { chamarOmieNaFila, esquecerFilasEPausas, idDaConta, pausaAte, pausaPedidaPeloOmie } from "./fila";

const CONTA_A = { appKey: "conta-a", appSecret: "a" };
const CONTA_B = { appKey: "conta-b", appSecret: "b" };

/** Um fetch que só responde quando o teste manda, e registra quem está em voo. */
function fetchControlado() {
  const emVoo: { call: string; responder: (status: number, corpo: unknown) => void }[] = [];
  const chamadas: string[] = [];
  let maximoEmParalelo = 0;
  const f = (async (_url: string, init: RequestInit) => {
    const call = (JSON.parse(String(init.body)) as { call: string }).call;
    chamadas.push(call);
    return new Promise<Response>((resolve) => {
      emVoo.push({ call, responder: (status, corpo) => resolve(new Response(JSON.stringify(corpo), { status })) });
      maximoEmParalelo = Math.max(maximoEmParalelo, emVoo.length);
    });
  }) as unknown as typeof fetch;
  const responderOPrimeiro = async (status = 200, corpo: unknown = { ok: 1 }) => {
    const primeiro = emVoo.shift();
    if (!primeiro) throw new Error("nada em voo");
    primeiro.responder(status, corpo);
    // Deixa a fila andar até a próxima chamada sair.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { f, emVoo, chamadas, responderOPrimeiro, maximo: () => maximoEmParalelo };
}

afterEach(() => esquecerFilasEPausas());

describe("idDaConta", () => {
  it("é estável por App Key e não carrega a chave", () => {
    expect(idDaConta(CONTA_A)).toBe(idDaConta({ appKey: " conta-a " }));
    expect(idDaConta(CONTA_A)).not.toBe(idDaConta(CONTA_B));
    expect(idDaConta(CONTA_A)).not.toContain("conta");
    expect(idDaConta(CONTA_A)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("a fila", () => {
  it("escrita da mesma conta sai uma por vez, mesmo em métodos diferentes", async () => {
    const r = fetchControlado();
    const um = chamarOmieNaFila(CONTA_A, "servicos/os", "IncluirOS", { x: 1 }, { escrita: true, fetch: r.f });
    const dois = chamarOmieNaFila(CONTA_A, "servicos/osp", "CancelarOS", { x: 2 }, { escrita: true, fetch: r.f });
    await new Promise((res) => setTimeout(res, 0));
    expect(r.chamadas).toEqual(["IncluirOS"]);
    await r.responderOPrimeiro();
    expect(r.chamadas).toEqual(["IncluirOS", "CancelarOS"]);
    await r.responderOPrimeiro();
    await Promise.all([um, dois]);
    expect(r.maximo()).toBe(1);
  });

  it("duas empresas do Connect com a mesma App Key dividem a mesma fila", async () => {
    // ELIO RUBENS e ER DIAS (13/10/2026): o segredo pode até estar diferente
    // em cada cadastro — a conta é a App Key.
    const r = fetchControlado();
    const daPrimeira = chamarOmieNaFila(CONTA_A, "servicos/os", "IncluirOS", {}, { escrita: true, fetch: r.f });
    const daSegunda = chamarOmieNaFila({ ...CONTA_A, appSecret: "c" }, "servicos/os", "IncluirOS", {}, { escrita: true, fetch: r.f });
    await new Promise((res) => setTimeout(res, 0));
    expect(r.emVoo).toHaveLength(1);
    await r.responderOPrimeiro();
    await r.responderOPrimeiro();
    await Promise.all([daPrimeira, daSegunda]);
    expect(r.maximo()).toBe(1);
  });

  it("contas diferentes não esperam uma pela outra", async () => {
    const r = fetchControlado();
    const a = chamarOmieNaFila(CONTA_A, "servicos/os", "IncluirOS", {}, { escrita: true, fetch: r.f });
    const b = chamarOmieNaFila(CONTA_B, "servicos/os", "IncluirOS", {}, { escrita: true, fetch: r.f });
    await new Promise((res) => setTimeout(res, 0));
    expect(r.emVoo).toHaveLength(2);
    await r.responderOPrimeiro();
    await r.responderOPrimeiro();
    await Promise.all([a, b]);
  });

  it("a falha de uma chamada não trava a fila", async () => {
    const r = fetchControlado();
    // O erro é capturado antes de responder: a rejeição chega enquanto o teste espera a fila andar.
    const um = chamarOmieNaFila(CONTA_A, "servicos/os", "IncluirOS", {}, { escrita: true, fetch: r.f }).catch((e: unknown) => e);
    const dois = chamarOmieNaFila(CONTA_A, "servicos/os", "IncluirOS", {}, { escrita: true, fetch: r.f });
    await new Promise((res) => setTimeout(res, 0));
    await r.responderOPrimeiro(500, { faultstring: "ERROR: Cliente não cadastrado", faultcode: "SOAP-ENV:Client-103" });
    expect(await um).toBeInstanceOf(ErroDoOmie);
    await r.responderOPrimeiro();
    await expect(dois).resolves.toEqual({ ok: 1 });
  });
});

describe("a pausa por bloqueio", () => {
  it("o 425 pausa o método por 30 minutos, e a próxima chamada nem sai", async () => {
    let agora = 1_000_000;
    const r = fetchControlado();
    const opcoes = { fetch: r.f, agora: () => agora };
    const primeira = chamarOmieNaFila(CONTA_A, "servicos/os", "StatusOS", {}, opcoes).catch((e: unknown) => e);
    await new Promise((res) => setTimeout(res, 0));
    await r.responderOPrimeiro(425, { faultstring: "API bloqueada por consumo indevido." });
    expect(await primeira).toBeInstanceOf(ErroDoOmie);
    expect(pausaAte(CONTA_A, "StatusOS", agora)).toBe(agora + 30 * 60_000);

    await expect(chamarOmieNaFila(CONTA_A, "servicos/os", "StatusOS", {}, opcoes)).rejects.toMatchObject({ codigo: "PAUSA" });
    expect(r.chamadas).toEqual(["StatusOS"]);

    // Outro método da mesma conta segue: o bloqueio do Omie é por método.
    const outra = chamarOmieNaFila(CONTA_A, "geral/clientes", "ListarClientes", {}, opcoes);
    await new Promise((res) => setTimeout(res, 0));
    await r.responderOPrimeiro();
    await expect(outra).resolves.toEqual({ ok: 1 });

    // Passada a pausa, volta a chamar.
    agora += 30 * 60_000 + 1;
    const depois = chamarOmieNaFila(CONTA_A, "servicos/os", "StatusOS", {}, opcoes);
    await new Promise((res) => setTimeout(res, 0));
    await r.responderOPrimeiro();
    await expect(depois).resolves.toEqual({ ok: 1 });
  });

  it("reconhece os bloqueios pelo código ou pelo sentido, e só eles", () => {
    expect(pausaPedidaPeloOmie(new ErroDoOmie("qualquer", null, 425))).toBe(30 * 60_000);
    expect(pausaPedidaPeloOmie(new ErroDoOmie("Too many requests", null, 500))).toBe(60_000);
    expect(pausaPedidaPeloOmie(new ErroDoOmie("x", null, 429))).toBe(60_000);
    expect(pausaPedidaPeloOmie(new ErroDoOmie("ERROR: Consumo redundante detectado.", null, 500))).toBe(60_000);
    expect(pausaPedidaPeloOmie(new ErroDoOmie("A requisição já foi processada.", null, 500))).toBe(60_000);
    expect(pausaPedidaPeloOmie(new ErroDoOmie("ERROR: Cliente não cadastrado", null, 500))).toBeNull();
    expect(pausaPedidaPeloOmie(new Error("rede"))).toBeNull();
  });
});
