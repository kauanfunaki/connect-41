import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco, simulado: cada consulta devolve o que o teste pôs e guarda o pedido.
// A leitura leve e os títulos são consultas diferentes do mesmo modelo — o
// `select` diz qual é qual.
type Linha = Record<string, unknown>;
const banco = vi.hoisted(() => ({
  processos: [] as Linha[],
  etapas: [] as Linha[],
  protocolos: [] as Linha[],
  mensagens: [] as Linha[],
  cards: [] as Linha[],
  atividades: [] as Linha[],
  pendencias: [] as Linha[],
  solicitacoes: [] as Linha[],
  transferencias: [] as Linha[],
  setores: [] as Linha[],
  empresas: [] as Linha[],
  pessoas: [] as Linha[],
  pedidos: [] as { modelo: string; metodo: string; args: Record<string, unknown> }[],
}));

function modelo(nome: string, findMany: () => Linha[], groupBy?: () => Linha[]) {
  return {
    findMany: vi.fn(async (args: Record<string, unknown>) => {
      banco.pedidos.push({ modelo: nome, metodo: "findMany", args });
      // Pelos ids (os títulos): só os pedidos.
      const ids = ((args.where as { id?: { in?: string[] } })?.id?.in ?? null) as string[] | null;
      const linhas = findMany();
      return ids ? linhas.filter((l) => ids.includes(l.id as string)) : linhas;
    }),
    groupBy: vi.fn(async (args: Record<string, unknown>) => {
      banco.pedidos.push({ modelo: nome, metodo: "groupBy", args });
      return groupBy ? groupBy() : [];
    }),
  };
}

const prisma = {
  process: modelo("process", () => banco.processos),
  processStep: modelo("processStep", () => [], () => banco.etapas),
  processProtocol: modelo("processProtocol", () => [], () => banco.protocolos),
  processMessage: modelo("processMessage", () => [], () => banco.mensagens),
  pipelineItem: modelo("pipelineItem", () => banco.cards),
  activity: modelo("activity", () => [], () => banco.atividades),
  clientRequest: modelo("clientRequest", () => banco.pendencias),
  serviceRequest: modelo("serviceRequest", () => banco.solicitacoes),
  handoffSector: modelo("handoffSector", () => banco.transferencias),
  sector: modelo("sector", () => banco.setores),
  company: modelo("company", () => banco.empresas),
  person: modelo("person", () => banco.pessoas),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: async () => true,
  setorDoModulo: async (_t: string, codigo: string) => (codigo === "bpo_pendencias" ? "bpo" : "societario"),
}));

import { comTitulos, itensDaGestao } from "./itens";

const AGORA = new Date("2026-11-13T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
const EMPRESA = { name: "ACME LTDA", displayName: "Acme" };

beforeEach(() => {
  banco.pedidos = [];
  banco.processos = [
    { id: "p1", number: 12, status: "EM_ANDAMENTO", dueAt: null, updatedAt: dias(-40), concludedAt: null, ownerUserId: "u1", companyId: "e1", title: "Filial", type: { name: "Alteração contratual" }, company: EMPRESA },
    { id: "p2", number: 13, status: "EM_ANDAMENTO", dueAt: dias(-2), updatedAt: dias(-40), concludedAt: null, ownerUserId: null, companyId: "e1", title: null, type: { name: "Abertura" }, company: EMPRESA },
  ];
  // p1 tem etapa feita (andou) e mensagem de ontem; p2 só tem etapa pendente, antiga.
  banco.etapas = [
    { processId: "p1", status: "CONCLUIDA", _max: { updatedAt: dias(-30) } },
    { processId: "p1", status: "PENDENTE", _max: { updatedAt: dias(-20) } },
    { processId: "p2", status: "PENDENTE", _max: { updatedAt: dias(-15) } },
  ];
  banco.protocolos = [{ processId: "p1", _max: { updatedAt: dias(-12) } }];
  banco.mensagens = [{ processId: "p1", _max: { createdAt: dias(-1) } }];
  banco.cards = [
    { id: "c1", number: 77, title: null, entityType: "COMPANY", entityId: "e1", dueDate: null, updatedAt: dias(-30), pipelineId: "q1", pipeline: { sectorCode: "dp", name: "Folha" }, stage: { type: "IN_PROGRESS" }, assignees: [{ userId: "u1" }] },
    { id: "c2", number: 78, title: "Conferir férias", entityType: null, entityId: null, dueDate: dias(1), updatedAt: dias(-30), pipelineId: "q1", pipeline: { sectorCode: "dp", name: "Folha" }, stage: { type: "IN_PROGRESS" }, assignees: [{ userId: "u2" }] },
  ];
  // c1 tem atividade de anteontem; c2 nenhuma — fica parado pelos 30 dias.
  banco.atividades = [{ pipelineItemId: "c1", _max: { createdAt: dias(-2) } }];
  banco.pendencias = [
    { id: "r1", number: 5, title: "Extrato de outubro", status: "ABERTA", dueDate: null, updatedAt: dias(-3), resolvedAt: null, createdById: "u3", companyId: "e1", sectorCode: null, company: EMPRESA },
  ];
  banco.solicitacoes = [
    { id: "s1", number: 7, status: "EM_ANDAMENTO", sectorCode: "fiscal", assigneeId: "u4", companyId: "e1", responseDue: dias(2), firstResponseAt: null, updatedAt: dias(-1), closedAt: null, subject: { label: "Guia de ISS" }, company: EMPRESA },
  ];
  banco.transferencias = [
    { id: "h1", handoffId: "hh1", sectorCode: "dp", status: "NEW", updatedAt: dias(-1), resolvedAt: null, assignees: [], handoff: { number: 9, fromSector: "fiscal", subject: "Admissão da Ana", message: null, description: null } },
  ];
  banco.setores = [
    { code: "dp", label: "Departamento Pessoal", alertStalledDays: null, alertDueSoonDays: null },
    { code: "fiscal", label: "Fiscal", alertStalledDays: null, alertDueSoonDays: null },
  ];
  banco.empresas = [{ id: "e1", ...EMPRESA }];
  banco.pessoas = [];
});

const porId = <T extends { item: { id: string } }>(xs: T[]) => new Map(xs.map((x) => [x.item.id, x]));

describe("a leitura leve da Gestão (melhoria-662)", () => {
  it("a última movimentação sai agregada no banco, com o mesmo resultado de antes", async () => {
    const itens = porId(await itensDaGestao("t1", "todos", AGORA));
    // p1: a mensagem de ontem é a mais recente; andou (há etapa fora do pendente).
    expect(itens.get("p1")!.item).toMatchObject({ estado: "ANDAMENTO", ultimaMovimentacao: dias(-1) });
    expect(itens.get("p1")!.c.parado).toBeNull();
    // p2: nenhuma etapa andou — não iniciado, a etapa de 15 dias é a última.
    expect(itens.get("p2")!.item).toMatchObject({ estado: "NAO_INICIADO", ultimaMovimentacao: dias(-15) });
    expect(itens.get("p2")!.c.prazo).toEqual({ situacao: "VENCIDO", dias: 2 });
    // c1 andou anteontem pela atividade; c2 está há 30 dias sem nada.
    expect(itens.get("c1")!.c.parado).toBeNull();
    expect(itens.get("c2")!.c).toMatchObject({ coluna: "PARADO", parado: 30, prazo: { situacao: "VENCENDO", dias: 1 } });
    // A pendência sem setor é do setor do módulo.
    expect(itens.get("r1")!.item).toMatchObject({ setor: "bpo", estado: "ESPERANDO_CLIENTE", responsaveis: ["u3"] });
    expect(itens.get("h1")!.item.href).toContain("9");
  });

  it("não traz título, empresa nem a lista de atividades, etapas ou mensagens", async () => {
    await itensDaGestao("t1", "todos", AGORA);
    const select = (m: string) => banco.pedidos.find((p) => p.modelo === m && p.metodo === "findMany")!.args.select as Record<string, unknown>;
    expect(Object.keys(select("pipelineItem"))).not.toEqual(expect.arrayContaining(["activities"]));
    expect(select("pipelineItem")).not.toHaveProperty("title");
    expect(select("process")).not.toHaveProperty("steps");
    expect(select("process")).not.toHaveProperty("messages");
    expect(select("process")).not.toHaveProperty("company");
    expect(select("clientRequest")).not.toHaveProperty("company");
    expect(select("serviceRequest")).not.toHaveProperty("subject");
    expect(select("handoffSector")).toMatchObject({ handoff: { select: { number: true } } });
    // A última atividade é uma consulta agregada, pelos ids dos cards lidos.
    const atividade = banco.pedidos.find((p) => p.modelo === "activity")!;
    expect(atividade).toMatchObject({ metodo: "groupBy", args: { by: ["pipelineItemId"], _max: { createdAt: true } } });
    expect((atividade.args.where as { pipelineItemId: { in: string[] } }).pipelineItemId.in).toEqual(["c1", "c2"]);
  });

  it("sem processo nem card, não consulta as agregações", async () => {
    banco.processos = [];
    banco.cards = [];
    await itensDaGestao("t1", "todos", AGORA);
    expect(banco.pedidos.some((p) => p.metodo === "groupBy")).toBe(false);
  });

  it("o coordenador de um setor só recebe os itens do setor dele", async () => {
    const itens = await itensDaGestao("t1", ["dp"], AGORA);
    expect(new Set(itens.map((x) => x.item.setor))).toEqual(new Set(["dp"]));
    expect(itens.map((x) => x.item.id).sort()).toEqual(["c1", "c2", "h1"]);
    // O recorte vai para dentro das consultas que têm o setor na linha.
    const cards = banco.pedidos.find((p) => p.modelo === "pipelineItem")!.args.where as { pipeline: { sectorCode: unknown } };
    expect(cards.pipeline.sectorCode).toEqual({ in: ["dp"] });
    // O Societário nem é consultado: o processo é de outro setor.
    expect(banco.pedidos.some((p) => p.modelo === "process")).toBe(false);
  });

  it("o recorte de uma pessoa chega às consultas de cada origem", async () => {
    await itensDaGestao("t1", "todos", AGORA, { responsavel: "u1" });
    const where = (m: string) => banco.pedidos.find((p) => p.modelo === m && p.metodo === "findMany")!.args.where as Record<string, unknown>;
    expect(where("process")).toMatchObject({ ownerUserId: "u1" });
    expect(where("pipelineItem")).toMatchObject({ assignees: { some: { userId: "u1" } } });
    expect(where("clientRequest")).toMatchObject({ createdById: "u1" });
    expect(where("serviceRequest")).toMatchObject({ assigneeId: "u1" });
    expect(where("handoffSector")).toMatchObject({ assignees: { some: { userId: "u1" } } });
  });
});

describe("os títulos, só do que aparece", () => {
  it("monta o título como antes, de cada origem", async () => {
    const itens = await itensDaGestao("t1", "todos", AGORA);
    const titulos = new Map((await comTitulos("t1", itens)).map((x) => [x.item.id, x.item.titulo]));
    expect(titulos.get("p1")).toBe("Alteração contratual — Acme (Filial)");
    expect(titulos.get("p2")).toBe("Abertura — Acme");
    // Card sem título leva o nome da empresa dele.
    expect(titulos.get("c1")).toBe("Acme — Folha");
    expect(titulos.get("c2")).toBe("Conferir férias — Folha");
    expect(titulos.get("r1")).toBe("Extrato de outubro — Acme");
    expect(titulos.get("s1")).toBe("Nº 7 · Guia de ISS — Acme");
    expect(titulos.get("h1")).toBe("Transferência de Fiscal — Admissão da Ana");
  });

  it("busca só os ids pedidos, mantém a ordem e a classificação", async () => {
    const itens = await itensDaGestao("t1", "todos", AGORA);
    banco.pedidos = [];
    const escolhidos = [itens.find((x) => x.item.id === "c2")!, itens.find((x) => x.item.id === "p1")!];
    const r = await comTitulos("t1", escolhidos);
    expect(r.map((x) => x.item.id)).toEqual(["c2", "p1"]);
    expect(r[0].c).toBe(escolhidos[0].c);
    expect(banco.pedidos.map((p) => p.modelo).sort()).toEqual(["pipelineItem", "process"]);
    const ids = (m: string) => (banco.pedidos.find((p) => p.modelo === m)!.args.where as { id: { in: string[] } }).id.in;
    expect(ids("pipelineItem")).toEqual(["c2"]);
    expect(ids("process")).toEqual(["p1"]);
  });

  it("lista vazia não consulta nada", async () => {
    expect(await comTitulos("t1", [])).toEqual([]);
    expect(banco.pedidos).toEqual([]);
  });

  it("item apagado entre as duas leituras fica com um traço no título", async () => {
    const itens = await itensDaGestao("t1", "todos", AGORA);
    banco.pendencias = [];
    const r = await comTitulos("t1", itens.filter((x) => x.item.id === "r1"));
    expect(r[0].item.titulo).toBe("—");
  });
});
