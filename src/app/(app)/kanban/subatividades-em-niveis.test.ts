import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { AVISO_DO_LIMITE, PROFUNDIDADE_MAXIMA } from "@/lib/kanban/subatividades";

// Subatividade dentro de subatividade (06/11/2026), nas ações de verdade. O
// banco é falso e em memória, com a cascata do `parentItemId` (ON DELETE
// CASCADE) — o bastante para criar, concluir, excluir, reordenar e duplicar a
// árvore e conferir o que ficou gravado.
//
// Quem age é o colaborador de um setor só (SECTOR_USER, "bpo") num espaço que
// o deixa editar — a conta do Kauan é admin e vê tudo, então o gesto do dia a
// dia vai com o perfil restrito. Excluir é do administrador.

type Item = {
  id: string;
  tenantId: string;
  pipelineId: string;
  stageId: string;
  parentItemId: string | null;
  title: string | null;
  order: number;
  createdAt: Date;
  entityType: null;
  entityId: null;
  description: null;
  priority: number;
};
type Atividade = { pipelineItemId: string; type: string; content: string };

let itens: Item[] = [];
let atividades: Atividade[] = [];
let permissaoDoEspaco = "EDITAR";
let seq = 0;

const colunas = [
  { id: "afazer", pipelineId: "pl1", name: "A fazer", order: 0, isTerminal: false, type: "NOT_STARTED", color: null },
  { id: "andando", pipelineId: "pl1", name: "Em andamento", order: 1, isTerminal: false, type: "IN_PROGRESS", color: null },
  { id: "feito", pipelineId: "pl1", name: "Feito", order: 2, isTerminal: true, type: "DONE", color: null },
];
const lista = { id: "pl1", tenantId: "t1", sectorCode: "bpo", spaceId: "s1", folderId: null, name: "Fechamento", entityType: "COMPANY", color: null };

type Onde = Record<string, unknown>;
function casa(i: Record<string, unknown>, where: Onde = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    const atual = i[k];
    if (v === null) return atual === null;
    if (typeof v === "object" && v !== null) {
      const f = v as { in?: unknown[]; not?: unknown };
      if (f.in) return f.in.includes(atual);
      if ("not" in f) return atual !== f.not;
    }
    return atual === v;
  });
}

const ordenar = (lista: Item[], orderBy?: unknown) => {
  const o = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  if (o && typeof o === "object" && "order" in o) {
    const dir = (o as { order: string }).order === "desc" ? -1 : 1;
    return [...lista].sort((a, b) => dir * (a.order - b.order));
  }
  return lista;
};

function novo(dados: Partial<Item> & Pick<Item, "pipelineId" | "stageId">): Item {
  const item: Item = {
    id: dados.id ?? `n${++seq}`,
    tenantId: "t1",
    parentItemId: null,
    title: null,
    order: 0,
    createdAt: new Date(Date.UTC(2026, 10, 6, 12, 0, seq)),
    entityType: null,
    entityId: null,
    description: null,
    priority: 0,
    ...dados,
  };
  itens.push(item);
  return item;
}

const pipelineItem = {
  findFirst: vi.fn(async ({ where, orderBy }: { where?: Onde; orderBy?: unknown }) => ordenar(itens.filter((i) => casa(i, where)), orderBy)[0] ?? null),
  findMany: vi.fn(async ({ where }: { where?: Onde }) => itens.filter((i) => casa(i, where))),
  create: vi.fn(async ({ data }: { data: Partial<Item> & Pick<Item, "pipelineId" | "stageId"> & { tags?: unknown; checklist?: unknown } }) => {
    // Etiquetas e checklist da cópia não entram no item (o teste olha a árvore).
    const resto = { ...data };
    delete resto.tags;
    delete resto.checklist;
    return novo(resto);
  }),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Item> }) => {
    const i = itens.find((x) => x.id === where.id)!;
    Object.assign(i, data);
    return i;
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Onde; data: Partial<Item> }) => {
    const alvo = itens.filter((i) => casa(i, where));
    alvo.forEach((i) => Object.assign(i, data));
    return { count: alvo.length };
  }),
  // A cascata do banco: some o item e tudo abaixo dele.
  delete: vi.fn(async ({ where }: { where: { id: string } }) => {
    const fora = new Set([where.id]);
    let cresceu = true;
    while (cresceu) {
      cresceu = false;
      for (const i of itens) if (i.parentItemId && fora.has(i.parentItemId) && !fora.has(i.id)) { fora.add(i.id); cresceu = true; }
    }
    itens = itens.filter((i) => !fora.has(i.id));
    return { id: where.id };
  }),
};

const prisma = {
  pipelineItem,
  pipeline: {
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "pl1" ? { ...lista, stages: colunas, items: itens.filter((i) => i.pipelineId === "pl1").map((i) => ({ ...i, tags: [], checklist: [] })) } : null)),
    create: vi.fn(async () => ({ id: "pl2", stages: colunas.map((c) => ({ ...c, id: `${c.id}-2`, pipelineId: "pl2" })) })),
  },
  pipelineStage: {
    findFirst: vi.fn(async ({ where, orderBy }: { where: Onde; orderBy?: { order: string } }) => {
      const achadas = colunas.filter((c) => casa(c, where));
      return (orderBy?.order === "desc" ? [...achadas].reverse() : achadas)[0] ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where: Onde }) => colunas.filter((c) => casa(c, where))),
  },
  activity: {
    create: vi.fn(async ({ data }: { data: Atividade }) => atividades.push(data)),
    createMany: vi.fn(async ({ data }: { data: Atividade[] }) => ({ count: atividades.push(...data) })),
  },
  space: { findUnique: vi.fn(async () => ({ defaultPermission: permissaoDoEspaco })) },
  company: { findFirst: vi.fn(async () => ({ id: "c2" })) },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (x: unknown) => logAudit(x) }));
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_USER" as UserRole,
  sectors: ["bpo"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
  scopedSectors: () => null,
}));

const { criarSubtarefa, concluirTarefa, excluirItem, excluirSubtarefa, reposicionarItem, duplicarPipeline } = await import("./actions");

/** Planilha › Abril › Dia 01 › Manhã, o exemplo do ClickUp. */
function montarExemplo() {
  novo({ id: "planilha", pipelineId: "pl1", stageId: "afazer", title: "Planilha" });
  novo({ id: "abril", pipelineId: "pl1", stageId: "afazer", title: "Abril", parentItemId: "planilha" });
  novo({ id: "dia01", pipelineId: "pl1", stageId: "andando", title: "Dia 01", parentItemId: "abril" });
  novo({ id: "manha", pipelineId: "pl1", stageId: "afazer", title: "Manhã", parentItemId: "dia01" });
  novo({ id: "tarde", pipelineId: "pl1", stageId: "feito", title: "Tarde", parentItemId: "dia01", order: 1 });
}

/** Uma corrente de `niveis` subatividades abaixo de "raiz"; devolve o id do último nível. */
function corrente(niveis: number): string {
  novo({ id: "raiz", pipelineId: "pl1", stageId: "afazer", title: "Raiz" });
  let pai = "raiz";
  for (let n = 1; n <= niveis; n++) pai = novo({ id: `nivel${n}`, pipelineId: "pl1", stageId: "afazer", title: `Nível ${n}`, parentItemId: pai }).id;
  return pai;
}

const doItem = (id: string) => itens.find((i) => i.id === id);
const filhasDe = (id: string) => itens.filter((i) => i.parentItemId === id).sort((a, b) => a.order - b.order);

beforeEach(() => {
  itens = [];
  atividades = [];
  seq = 0;
  permissaoDoEspaco = "EDITAR";
  ctx.role = "SECTOR_USER";
  ctx.sectors = ["bpo"];
  vi.clearAllMocks();
});

describe("criarSubtarefa — subatividade dentro de subatividade", () => {
  it("cria dentro da subatividade (a ISS dentro do IMPOSTO), herdando a lista e começando na primeira coluna", async () => {
    montarExemplo();
    expect(await criarSubtarefa("manha", "Conferir extrato")).toBeUndefined();
    const [nova] = filhasDe("manha");
    expect(nova).toMatchObject({ title: "Conferir extrato", pipelineId: "pl1", stageId: "afazer", parentItemId: "manha" });
  });

  it("entra no fim das irmãs, e não em 0 na frente das que já têm ordem", async () => {
    montarExemplo();
    await criarSubtarefa("dia01", "Noite");
    expect(filhasDe("dia01").map((i) => i.title)).toEqual(["Manhã", "Tarde", "Noite"]);
    expect(doItem(filhasDe("dia01")[2].id)?.order).toBe(2);
  });

  it("deixa rastro nos dois históricos: no pai, a criação; na nova, de onde veio", async () => {
    montarExemplo();
    await criarSubtarefa("dia01", "Noite");
    const nova = filhasDe("dia01")[2];
    expect(atividades).toContainEqual(expect.objectContaining({ pipelineItemId: "dia01", type: "SUBTASK_CHANGE", content: 'Subatividade "Noite" criada' }));
    expect(atividades).toContainEqual(expect.objectContaining({ pipelineItemId: nova.id, type: "CREATED", content: 'Criada como subatividade de "Dia 01"' }));
  });

  it(`aceita até o ${PROFUNDIDADE_MAXIMA}º nível e recusa abaixo dele, com o aviso`, async () => {
    const penultimo = corrente(PROFUNDIDADE_MAXIMA - 1);
    expect(await criarSubtarefa(penultimo, "Último nível")).toBeUndefined();
    const ultimo = filhasDe(penultimo)[0];
    expect(ultimo).toBeDefined();

    const antes = itens.length;
    expect(await criarSubtarefa(ultimo.id, "Fundo demais")).toEqual({ error: AVISO_DO_LIMITE });
    expect(itens.length).toBe(antes);
  });

  it("quem só comenta no espaço não cria", async () => {
    montarExemplo();
    permissaoDoEspaco = "COMENTAR";
    expect(await criarSubtarefa("abril", "Dia 02")).toEqual({ error: "Você não pode criar subatividades nesta lista." });
    expect(filhasDe("abril")).toHaveLength(1);
  });

  it("quem não é do setor da lista não cria", async () => {
    montarExemplo();
    ctx.sectors = ["dp"];
    expect(await criarSubtarefa("abril", "Dia 02")).toHaveProperty("error");
    expect(filhasDe("abril")).toHaveLength(1);
  });
});

describe("concluirTarefa — o pai com filhas abertas", () => {
  it("com as subatividades: conclui as abertas de todos os níveis, cada uma com o próprio registro", async () => {
    montarExemplo();
    await concluirTarefa("pl1", "planilha", true);
    for (const id of ["planilha", "abril", "dia01", "manha", "tarde"]) expect(doItem(id)?.stageId).toBe("feito");
    expect(atividades).toContainEqual(expect.objectContaining({ pipelineItemId: "planilha", type: "COMPLETED", content: "Atividade concluída, com 3 subatividades dentro dela" }));
    // A Tarde já estava concluída: não ganha registro de novo.
    expect(atividades.filter((a) => a.content === 'Concluída junto com "Planilha"').map((a) => a.pipelineItemId).sort()).toEqual(["abril", "dia01", "manha"]);
  });

  it("sem as subatividades: só o pai, as filhas ficam como estão", async () => {
    montarExemplo();
    await concluirTarefa("pl1", "abril");
    expect(doItem("abril")?.stageId).toBe("feito");
    expect(doItem("dia01")?.stageId).toBe("andando");
    expect(doItem("manha")?.stageId).toBe("afazer");
  });

  it("o item tem de ser da lista que libera a ação", async () => {
    montarExemplo();
    novo({ id: "deOutraLista", pipelineId: "pl9", stageId: "x", title: "Outra" });
    await concluirTarefa("pl1", "deOutraLista", true);
    expect(doItem("deOutraLista")?.stageId).toBe("x");
  });
});

describe("excluir — a cascata leva a árvore, e o rastro fica", () => {
  it("só o administrador exclui; o colaborador não apaga nada", async () => {
    montarExemplo();
    await excluirItem("pl1", "abril");
    await excluirSubtarefa("planilha", "abril");
    expect(itens).toHaveLength(5);
  });

  it("excluir a subatividade leva os níveis abaixo, avisa no pai e grava a auditoria com quantas foram", async () => {
    montarExemplo();
    ctx.role = "ADMIN";
    await excluirSubtarefa("planilha", "abril");
    expect(itens.map((i) => i.id)).toEqual(["planilha"]);
    expect(atividades).toContainEqual(expect.objectContaining({ pipelineItemId: "planilha", type: "SUBTASK_CHANGE", content: 'Subatividade "Abril" removida, com 3 subatividades dentro dela' }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "kanban.atividade.excluir",
      entityType: "PipelineItem",
      entityId: "abril",
      metadata: { title: "Abril", subatividades: 3, pai: "planilha" },
    }));
  });

  it("excluir pela lista uma subatividade do meio também deixa o rastro no pai", async () => {
    montarExemplo();
    ctx.role = "ADMIN";
    await excluirItem("pl1", "dia01");
    expect(itens.map((i) => i.id).sort()).toEqual(["abril", "planilha"]);
    expect(atividades).toContainEqual(expect.objectContaining({ pipelineItemId: "abril", content: 'Subatividade "Dia 01" removida, com 2 subatividades dentro dela' }));
  });

  it("a atividade de cima vai para a auditoria com a árvore inteira", async () => {
    montarExemplo();
    ctx.role = "ADMIN";
    await excluirItem("pl1", "planilha");
    expect(itens).toEqual([]);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "planilha", metadata: { title: "Planilha", subatividades: 4 } }));
  });
});

describe("reposicionarItem — a ordem entre irmãs", () => {
  it("subatividade troca de lugar com a irmã, mesmo em outra coluna", async () => {
    montarExemplo();
    await reposicionarItem("tarde", "manha");
    expect(filhasDe("dia01").map((i) => i.id)).toEqual(["tarde", "manha"]);
  });

  it("de pais diferentes, não muda de pai: recusa com o aviso", async () => {
    montarExemplo();
    expect(await reposicionarItem("manha", "abril")).toEqual({ error: "Arrastando, a atividade muda de lugar só entre as do mesmo nível." });
    expect(doItem("manha")?.parentItemId).toBe("dia01");
  });

  it("anda com várias de ordem 0 empatadas (o caso que travava a troca)", async () => {
    novo({ id: "a", pipelineId: "pl1", stageId: "afazer", title: "A" });
    novo({ id: "b", pipelineId: "pl1", stageId: "afazer", title: "B" });
    novo({ id: "c", pipelineId: "pl1", stageId: "afazer", title: "C" });
    await reposicionarItem("c", "a");
    const ordem = itens.filter((i) => i.parentItemId === null).sort((x, y) => x.order - y.order).map((i) => i.id);
    expect(ordem).toEqual(["c", "a", "b"]);
  });

  it("atividade de cima só entre as da mesma coluna", async () => {
    novo({ id: "a", pipelineId: "pl1", stageId: "afazer", title: "A" });
    novo({ id: "b", pipelineId: "pl1", stageId: "feito", title: "B", order: 5 });
    await reposicionarItem("a", "b");
    expect(doItem("a")?.order).toBe(0);
    expect(doItem("b")?.order).toBe(5);
  });
});

describe("duplicarPipeline — a cópia leva todos os níveis", () => {
  it("remonta a árvore inteira na lista nova, com a ordem", async () => {
    montarExemplo();
    const f = new FormData();
    f.set("name", "Fechamento — cópia");
    f.set("entityId", "c2");
    await duplicarPipeline("pl1", null, f);

    const copia = itens.filter((i) => i.pipelineId === "pl2");
    expect(copia).toHaveLength(5);
    const pelo = (t: string) => copia.find((i) => i.title === t)!;
    expect(pelo("Planilha").parentItemId).toBeNull();
    expect(pelo("Abril").parentItemId).toBe(pelo("Planilha").id);
    expect(pelo("Dia 01").parentItemId).toBe(pelo("Abril").id);
    expect(pelo("Manhã").parentItemId).toBe(pelo("Dia 01").id);
    expect(pelo("Tarde")).toMatchObject({ parentItemId: pelo("Dia 01").id, order: 1, stageId: "feito-2" });
  });
});
