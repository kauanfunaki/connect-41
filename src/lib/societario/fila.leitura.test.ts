import { beforeEach, describe, expect, it, vi } from "vitest";

// A fila em duas leituras (13/11/2026, melhoria-662): a leve ordena, conta e
// busca; as etapas liberadas vêm só para as linhas que a página mostra.
const banco = vi.hoisted(() => ({
  processos: [] as Record<string, unknown>[],
  pedidos: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    process: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        banco.pedidos.push(args);
        const ids = (args.where as { id?: { in?: string[] } }).id?.in;
        return ids ? banco.processos.filter((p) => ids.includes(p.id as string)) : banco.processos;
      }),
    },
  }),
}));

const { listarFila, listarFilaLeve, comEtapasAgora } = await import("./fila");

const ROTEIRO = {
  steps: [
    { id: "t1", position: 1, parallelGroup: null, optional: false, label: "Viabilidade" },
    { id: "t2", position: 2, parallelGroup: null, optional: false, label: "Registro" },
    { id: "t3", position: 2, parallelGroup: null, optional: false, label: "Inscrição municipal" },
  ],
};
const processo = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  number: Number(id.slice(1)),
  startedAt: new Date("2026-10-01T12:00:00Z"),
  concludedAt: null,
  status: "EM_ANDAMENTO",
  ownerUserId: null,
  title: null,
  priority: "NORMAL",
  dueAt: null,
  company: { id: "e1", name: "ALFA LTDA", displayName: "Alfa" },
  owner: null,
  type: { name: "Constituição", expectedDaysMin: 5, expectedDaysMax: 10, variableFlow: false },
  template: ROTEIRO,
  steps: [{ templateStepId: "t1", status: "CONCLUIDA" }],
  protocols: [],
  ...over,
});
const AGORA = new Date("2026-11-13T12:00:00Z");

beforeEach(() => {
  banco.pedidos = [];
  banco.processos = [
    processo("p1"),
    processo("p2", { steps: [], protocols: [{ organId: "o1", attempt: 1, outcome: "EXIGENCIA" }] }),
    processo("p3", { steps: [{ templateStepId: "t1", status: "CONCLUIDA" }, { templateStepId: "t2", status: "CONCLUIDA" }, { templateStepId: "t3", status: "DISPENSADA" }] }),
  ];
});

describe("a fila em duas leituras", () => {
  it("a leitura leve não traz o roteiro nem as etapas de cada processo", async () => {
    const linhas = await listarFilaLeve("t1", {}, new Set(), AGORA);
    const select = banco.pedidos[0].select as Record<string, unknown>;
    expect(select).not.toHaveProperty("template");
    expect(select).not.toHaveProperty("steps");
    expect(select).toHaveProperty("protocols");
    // A ordem e a situação continuam: exigência primeiro.
    expect(linhas.map((l) => [l.id, l.situacao])).toEqual([
      ["p2", "EM_EXIGENCIA"],
      ["p1", "EM_ANDAMENTO"],
      ["p3", "EM_ANDAMENTO"],
    ]);
    expect(linhas[0]).not.toHaveProperty("etapasAgora");
  });

  it("as etapas liberadas vêm só das linhas pedidas, na mesma ordem", async () => {
    const leves = await listarFilaLeve("t1", {}, new Set(), AGORA);
    banco.pedidos = [];
    const pagina = await comEtapasAgora("t1", [leves[1], leves[0]]);
    expect((banco.pedidos[0].where as { id: { in: string[] } }).id.in).toEqual(["p1", "p2"]);
    expect(pagina.map((l) => l.id)).toEqual(["p1", "p2"]);
    // p1: a primeira etapa feita libera as duas da posição 2; p2: só a primeira.
    expect(pagina[0].etapasAgora).toEqual(["Registro", "Inscrição municipal"]);
    expect(pagina[1].etapasAgora).toEqual(["Viabilidade"]);
    expect(pagina[1].situacao).toBe("EM_EXIGENCIA");
  });

  it("processo com tudo encerrado não tem etapa liberada; lista vazia não consulta", async () => {
    const leves = await listarFilaLeve("t1", {}, new Set(), AGORA);
    const [p3] = await comEtapasAgora("t1", leves.filter((l) => l.id === "p3"));
    expect(p3.etapasAgora).toEqual([]);
    banco.pedidos = [];
    expect(await comEtapasAgora("t1", [])).toEqual([]);
    expect(banco.pedidos).toHaveLength(0);
  });

  it("a fila inteira (a da Ceci) segue com as etapas de todas as linhas", async () => {
    const todas = await listarFila("t1", {}, new Set(), AGORA);
    expect(todas.map((l) => [l.id, l.etapasAgora])).toEqual([
      ["p2", ["Viabilidade"]],
      ["p1", ["Registro", "Inscrição municipal"]],
      ["p3", []],
    ]);
  });
});
