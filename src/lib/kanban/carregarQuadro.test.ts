import { beforeEach, describe, expect, it, vi } from "vitest";
import { contarFilhas, montarArvore, PROFUNDIDADE_MAXIMA } from "./subatividades";
import { lerLimiteDeConcluidas, proximoLimite } from "./concluidasDoQuadro";

// O carregamento do quadro de uma lista (10/11/2026), num banco falso e em
// memória: o bastante para conferir quais itens vêm, quantos de cada coluna
// concluída, e que as atividades só são lidas dos itens carregados.

type Item = {
  id: string;
  tenantId: string;
  pipelineId: string;
  stageId: string;
  parentItemId: string | null;
  title: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};
type Atividade = { tenantId: string; pipelineItemId: string; type: string; content: string | null; createdAt: Date; user: { id: string; name: string } };

const colunas = [
  { id: "afazer", pipelineId: "pl1", name: "A fazer", order: 0, isTerminal: false },
  { id: "andando", pipelineId: "pl1", name: "Em andamento", order: 1, isTerminal: false },
  { id: "feito", pipelineId: "pl1", name: "Feito", order: 2, isTerminal: true },
  { id: "cancelado", pipelineId: "pl1", name: "Cancelado", order: 3, isTerminal: true },
];
const lista = { id: "pl1", tenantId: "t1", name: "Fechamento", space: { id: "s1", name: "BPO" }, folder: null, stages: colunas };

let itens: Item[] = [];
let atividades: Atividade[] = [];
let seq = 0;

type Onde = Record<string, unknown>;
const mesmoValor = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function casa(i: Record<string, unknown>, where: Onde = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    const atual = i[k];
    if (v === null) return atual === null;
    if (typeof v === "object" && !(v instanceof Date)) {
      const f = v as { in?: unknown[]; not?: unknown };
      if (f.in) return f.in.some((x) => mesmoValor(x, atual));
      if ("not" in f) return f.not === null ? atual !== null : atual !== f.not;
    }
    return mesmoValor(atual, v);
  });
}

const comRelacoes = (i: Item) => ({ ...i, stage: colunas.find((c) => c.id === i.stageId)!, tags: [], assignees: [] });

const pipelineItem = {
  findMany: vi.fn(async ({ where, orderBy, take }: { where: Onde; orderBy?: unknown; take?: number }) => {
    let achados = itens.filter((i) => casa(i, where));
    if (orderBy) achados = [...achados].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
    if (take !== undefined) achados = achados.slice(0, take);
    return achados.map(comRelacoes);
  }),
  groupBy: vi.fn(async ({ where }: { where: Onde }) => {
    const porColuna = new Map<string, number>();
    for (const i of itens.filter((x) => casa(x, where))) porColuna.set(i.stageId, (porColuna.get(i.stageId) ?? 0) + 1);
    return [...porColuna].map(([stageId, n]) => ({ stageId, _count: { _all: n } }));
  }),
};
const activity = {
  groupBy: vi.fn(async ({ where }: { where: Onde }) => {
    const maior = new Map<string, Date>();
    for (const a of atividades.filter((x) => casa(x, where))) {
      const atual = maior.get(a.pipelineItemId);
      if (!atual || a.createdAt > atual) maior.set(a.pipelineItemId, a.createdAt);
    }
    return [...maior].map(([pipelineItemId, createdAt]) => ({ pipelineItemId, _max: { createdAt } }));
  }),
  findMany: vi.fn(async ({ where }: { where: Onde }) => atividades.filter((a) => casa(a, where))),
};
const prisma = {
  pipeline: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "pl1" ? lista : null)) },
  pipelineItem,
  activity,
};
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));

const { carregarQuadro } = await import("./carregarQuadro");

const quando = (minutos: number) => new Date(Date.UTC(2026, 0, 1) + minutos * 60_000);
function novo(dados: Partial<Item> & Pick<Item, "stageId">): Item {
  seq++;
  const item: Item = {
    id: `i${String(seq).padStart(4, "0")}`,
    tenantId: "t1",
    pipelineId: "pl1",
    parentItemId: null,
    title: `Item ${seq}`,
    order: 0,
    createdAt: quando(seq),
    updatedAt: quando(seq),
    ...dados,
  };
  itens.push(item);
  return item;
}
function atividade(pipelineItemId: string, type: string, minutos: number, content: string | null = null, autor = "Ana") {
  atividades.push({ tenantId: "t1", pipelineItemId, type, content, createdAt: quando(minutos), user: { id: autor.toLowerCase(), name: autor } });
}

const carregar = (limiteDeConcluidas = 50) => carregarQuadro({ tenantId: "t1", where: { id: "pl1" }, limiteDeConcluidas });
const ids = (lista: { id: string }[]) => lista.map((i) => i.id);

beforeEach(() => {
  itens = [];
  atividades = [];
  seq = 0;
  vi.clearAllMocks();
});

describe("carregarQuadro — concluídas limitadas", () => {
  it("traz os abertos inteiros e só as 50 concluídas mais recentes, com o total da coluna", async () => {
    const abertos = Array.from({ length: 70 }, () => novo({ stageId: "afazer" }));
    const feitos = Array.from({ length: 120 }, () => novo({ stageId: "feito" }));
    novo({ stageId: "cancelado" });

    const q = (await carregar())!;
    const doTopo = q.itens.filter((i) => i.parentItemId === null);
    expect(doTopo.filter((i) => i.stageId === "afazer")).toHaveLength(70);
    expect(ids(doTopo.filter((i) => i.stageId === "feito")).sort()).toEqual(ids(feitos.slice(-50)).sort());
    expect(q.concluidas).toEqual({ feito: { total: 120, mostradas: 50 }, cancelado: { total: 1, mostradas: 1 } });
    expect(ids(abertos).every((id) => q.itens.some((i) => i.id === id))).toBe(true);

    const mais = (await carregar(100))!;
    expect(mais.concluidas.feito).toEqual({ total: 120, mostradas: 100 });
  });

  it("a concluída mexida há pouco volta para as recentes", async () => {
    const antiga = novo({ stageId: "feito" });
    Array.from({ length: 60 }, () => novo({ stageId: "feito" }));
    antiga.updatedAt = quando(10_000);
    const q = (await carregar())!;
    expect(q.itens.some((i) => i.id === antiga.id)).toBe(true);
  });

  it("o ?concluidas=N anda de 50 em 50, com teto", () => {
    expect(lerLimiteDeConcluidas(undefined)).toBe(50);
    expect(lerLimiteDeConcluidas("abc")).toBe(50);
    expect(lerLimiteDeConcluidas("-3")).toBe(50);
    expect(lerLimiteDeConcluidas("100")).toBe(100);
    expect(lerLimiteDeConcluidas("120")).toBe(150);
    expect(lerLimiteDeConcluidas(["200", "50"])).toBe(200);
    expect(lerLimiteDeConcluidas("999999")).toBe(1000);
    expect(proximoLimite(50)).toBe(100);
    expect(proximoLimite(1000)).toBeNull();
  });

  it("lista que não existe ou que a pessoa não vê: null", async () => {
    expect(await carregarQuadro({ tenantId: "t1", where: { id: "outra" }, limiteDeConcluidas: 50 })).toBeNull();
  });
});

describe("carregarQuadro — subatividades", () => {
  it("filho concluído sob pai aberto aparece, e o x/y conta certo", async () => {
    const pai = novo({ stageId: "andando" });
    // 60 concluídas de topo mais novas que a filha: a filha não entra pelo limite, entra pelo pai.
    const filhaFeita = novo({ stageId: "feito", parentItemId: pai.id });
    novo({ stageId: "afazer", parentItemId: pai.id });
    Array.from({ length: 60 }, () => novo({ stageId: "feito" }));

    const q = (await carregar())!;
    const arvore = montarArvore(q.itens);
    const raiz = arvore.find((n) => n.id === pai.id)!;
    expect(ids(raiz.filhas)).toContain(filhaFeita.id);
    expect(contarFilhas(raiz, (f) => f.stage.isTerminal)).toEqual({ concluidas: 1, total: 2 });
    // A filha concluída não conta como concluída de topo da coluna.
    expect(q.concluidas.feito).toEqual({ total: 60, mostradas: 50 });
  });

  it("pai concluído antigo com subatividade aberta continua no quadro, mesmo vários níveis acima", async () => {
    const paiAntigo = novo({ stageId: "feito" });
    const filhaAberta = novo({ stageId: "afazer", parentItemId: paiAntigo.id });
    const avoAntigo = novo({ stageId: "cancelado" });
    const meio = novo({ stageId: "feito", parentItemId: avoAntigo.id });
    const netaAberta = novo({ stageId: "andando", parentItemId: meio.id });
    const esquecido = novo({ stageId: "feito" }); // concluído antigo, sem nada aberto
    Array.from({ length: 55 }, () => novo({ stageId: "feito" }));
    Array.from({ length: 55 }, () => novo({ stageId: "cancelado" }));

    const q = (await carregar())!;
    const carregados = ids(q.itens);
    expect(carregados).toEqual(expect.arrayContaining([paiAntigo.id, filhaAberta.id, avoAntigo.id, meio.id, netaAberta.id]));
    expect(carregados).not.toContain(esquecido.id);
    expect(q.concluidas.feito).toEqual({ total: 57, mostradas: 51 });
    expect(q.concluidas.cancelado).toEqual({ total: 56, mostradas: 51 });

    const arvore = montarArvore(q.itens);
    expect(ids(arvore.find((n) => n.id === avoAntigo.id)!.filhas[0].filhas)).toEqual([netaAberta.id]);
  });

  it("carrega todos os níveis abaixo dos itens carregados, uma leitura por nível", async () => {
    const raiz = novo({ stageId: "afazer" });
    let pai = raiz.id;
    const corrente: string[] = [];
    for (let n = 1; n <= PROFUNDIDADE_MAXIMA; n++) {
      pai = novo({ stageId: n % 2 ? "feito" : "afazer", parentItemId: pai }).id;
      corrente.push(pai);
    }
    // Subatividade de item concluído que ficou fora do limite: não vem.
    const foraDoLimite = novo({ stageId: "feito", updatedAt: quando(-1) });
    const filhaDeFora = novo({ stageId: "feito", parentItemId: foraDoLimite.id });

    const q = (await carregar(50))!;
    expect(ids(q.itens)).toEqual(expect.arrayContaining(corrente));

    let no = montarArvore(q.itens).find((n) => n.id === raiz.id)!;
    for (const id of corrente) {
      expect(no.filhas.map((f) => f.id)).toEqual([id]);
      no = no.filhas[0];
    }
    expect(ids(q.itens)).toContain(filhaDeFora.id); // o pai, concluído recente, coube nos 50
  });

  it("subatividade de concluída que não coube não é lida", async () => {
    const velha = novo({ stageId: "feito", updatedAt: quando(-100) });
    const filhaDaVelha = novo({ stageId: "feito", parentItemId: velha.id });
    Array.from({ length: 50 }, () => novo({ stageId: "feito" }));
    const q = (await carregar())!;
    expect(ids(q.itens)).not.toContain(velha.id);
    expect(ids(q.itens)).not.toContain(filhaDaVelha.id);
  });
});

describe("carregarQuadro — atividades só dos itens carregados", () => {
  it("dias na etapa pela última mudança (_max), criador e última atividade", async () => {
    const a = novo({ stageId: "andando" });
    const b = novo({ stageId: "afazer" });
    const foraDoLimite = novo({ stageId: "feito", updatedAt: quando(-100) });
    Array.from({ length: 50 }, () => novo({ stageId: "feito" }));

    atividade(a.id, "CREATED", 1, null, "Bruno");
    atividade(a.id, "STATUS_CHANGE", 10);
    atividade(a.id, "STATUS_CHANGE", 30);
    atividade(a.id, "NOTE", 40, "Conferi o extrato");
    atividade(b.id, "CREATED", 2, null, "Carla");
    atividade(foraDoLimite.id, "CREATED", 3, null, "Davi");
    atividade(foraDoLimite.id, "STATUS_CHANGE", 50);

    const q = (await carregar())!;
    expect(q.ultimaMudancaDeEtapa).toEqual({ [a.id]: quando(30) });
    expect(q.criador[a.id]).toEqual({ id: "bruno", name: "Bruno" });
    expect(q.criador[b.id]).toEqual({ id: "carla", name: "Carla" });
    expect(q.criador[foraDoLimite.id]).toBeUndefined();
    expect(q.ultimaAtividade[a.id]).toBe("Conferi o extrato");
    expect(q.ultimaAtividade[b.id]).toBe("Criado");

    // Toda leitura de atividade se restringe aos ids carregados.
    const pedidos = [...activity.groupBy.mock.calls, ...activity.findMany.mock.calls].map(([arg]) => arg.where.pipelineItemId as { in: string[] });
    for (const p of pedidos) expect(p.in).not.toContain(foraDoLimite.id);
    const statusChange = activity.groupBy.mock.calls.find(([arg]) => arg.where.type === "STATUS_CHANGE")!;
    expect(statusChange[0]).toMatchObject({ by: ["pipelineItemId"], _max: { createdAt: true } });
  });
});
