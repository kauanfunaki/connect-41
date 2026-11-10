import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { NOME_DA_TAREFA_NAO_CONFERE, TAREFA_GANHOU_ATIVIDADES } from "@/lib/kanban/exclusaoDeTarefa";

// Excluir a tarefa com as atividades dentro (10/11/2026), na action de verdade.
// O banco é falso e em memória, com a cascata do `parentItemId` e a chave
// RESTRICT da atividade para a tarefa — o bastante para conferir o que sai,
// o que continua travando e o que fica na Auditoria. O disco é falso: o teste
// olha quais arquivos a exclusão mandou apagar.

type Item = { id: string; tenantId: string; pipelineId: string; parentItemId: string | null };
type Documento = { tenantId: string; entityType: string; entityId: string; fileUrl: string };

let itens: Item[] = [];
let documentos: Documento[] = [];
let tarefas: string[] = [];
const travas = { recurringObligations: 0, modelosDeObrigacao: 0, assuntosDeSolicitacao: 0 };

const TAREFA = { id: "pl1", tenantId: "t1", sectorCode: "bpo", spaceId: "s1", folderId: "f1", name: "Conciliações de Abril" };

function semAArvore(lista: Item[], ids: string[]): Item[] {
  const fora = new Set(ids);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const i of lista) if (i.parentItemId && fora.has(i.parentItemId) && !fora.has(i.id)) { fora.add(i.id); cresceu = true; }
  }
  return lista.filter((i) => !fora.has(i.id));
}

const apagouAlgo = vi.fn();
const prisma = {
  pipeline: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) =>
      tarefas.includes(where.id) && where.tenantId === TAREFA.tenantId
        ? { ...TAREFA, space: { id: "s1", sectorCode: "bpo" }, _count: { items: itens.filter((i) => i.pipelineId === where.id).length, ...travas } }
        : null),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (itens.some((i) => i.pipelineId === where.id)) throw new Error("chave estrangeira");
      apagouAlgo();
      tarefas = tarefas.filter((t) => t !== where.id);
    }),
  },
  pipelineItem: {
    findMany: vi.fn(async ({ where }: { where: { tenantId: string; pipelineId: string } }) =>
      itens.filter((i) => i.tenantId === where.tenantId && i.pipelineId === where.pipelineId).map(({ id, parentItemId }) => ({ id, parentItemId }))),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      apagouAlgo();
      itens = semAArvore(itens, where.id.in);
      return { count: where.id.in.length };
    }),
  },
  document: {
    findMany: vi.fn(async ({ where }: { where: { tenantId: string; entityType: string; entityId: { in: string[] } } }) =>
      documentos.filter((d) => d.tenantId === where.tenantId && d.entityType === where.entityType && where.entityId.in.includes(d.entityId))),
    deleteMany: vi.fn(async ({ where }: { where: { tenantId: string; entityType: string; entityId: { in: string[] } } }) => {
      apagouAlgo();
      documentos = documentos.filter((d) => !(d.tenantId === where.tenantId && d.entityType === where.entityType && where.entityId.in.includes(d.entityId)));
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const antes = { itens, documentos, tarefas };
    try {
      return await fn(prisma);
    } catch (err) {
      ({ itens, documentos, tarefas } = antes);
      throw err;
    }
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (x: unknown) => logAudit(x) }));
const arquivosApagados: string[][] = [];
vi.mock("@/lib/exclusao/arquivos", async (original) => {
  const real = await original<typeof import("@/lib/exclusao/arquivos")>();
  return { ...real, apagarArquivos: vi.fn(async (a: { storage: { documents?: string[] } }) => { arquivosApagados.push(a.storage.documents ?? []); return 0; }) };
});

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "ADMIN" as UserRole,
  sectors: [] as string[],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
  scopedSectors: () => null,
}));

const { excluirLista } = await import("./spaces-actions");

/** Planilha › Abril › Dia 01 › Manhã, e uma atividade solta. Outra tarefa tem atividade com anexo. */
function montarExemplo() {
  const item = (id: string, parentItemId: string | null, pipelineId = "pl1") => ({ id, tenantId: "t1", pipelineId, parentItemId });
  itens = [item("planilha", null), item("abril", "planilha"), item("dia01", "abril"), item("manha", "dia01"), item("solta", null), item("deOutra", null, "pl2")];
  const anexo = (entityId: string, fileUrl: string): Documento => ({ tenantId: "t1", entityType: "PIPELINE_ITEM", entityId, fileUrl });
  documentos = [anexo("planilha", "t1/planilha.pdf"), anexo("manha", "t1/manha.png"), anexo("solta", "t1/solta.xml"), anexo("deOutra", "t1/outra.pdf")];
  // Um documento de empresa com o mesmo id não é anexo de atividade.
  documentos.push({ tenantId: "t1", entityType: "COMPANY", entityId: "planilha", fileUrl: "t1/empresa.pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  arquivosApagados.length = 0;
  itens = [];
  documentos = [];
  tarefas = ["pl1", "pl2"];
  Object.assign(travas, { recurringObligations: 0, modelosDeObrigacao: 0, assuntosDeSolicitacao: 0 });
  ctx.role = "ADMIN";
  ctx.sectors = [];
});

describe("excluirLista — a tarefa sai com as atividades dentro", () => {
  it("com o nome digitado, leva a árvore inteira e os anexos de todos os níveis, e grava a auditoria com os números", async () => {
    montarExemplo();
    expect(await excluirLista("pl1", "  conciliações de abril ")).toBeNull();

    expect(tarefas).toEqual(["pl2"]);
    expect(itens.map((i) => i.id)).toEqual(["deOutra"]);
    expect(documentos.map((d) => d.fileUrl)).toEqual(["t1/outra.pdf", "t1/empresa.pdf"]);
    expect(arquivosApagados).toEqual([["t1/planilha.pdf", "t1/manha.png", "t1/solta.xml"]]);
    expect(logAudit).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "eu",
      action: "kanban.tarefa.excluir",
      entityType: "Pipeline",
      entityId: "pl1",
      metadata: { name: "Conciliações de Abril", setor: "bpo", atividades: 2, subatividades: 3, anexos: 3 },
    });
  });

  it.each([
    // A tela abriu a confirmação simples (estava vazia) e alguém criou atividade no meio do caminho.
    ["sem o nome", undefined, TAREFA_GANHOU_ATIVIDADES],
    ["com o nome vazio", "", NOME_DA_TAREFA_NAO_CONFERE],
    ["com o nome errado", "Conciliações de Maio", NOME_DA_TAREFA_NAO_CONFERE],
    ["com o nome pela metade", "Conciliações", NOME_DA_TAREFA_NAO_CONFERE],
  ])("com atividade dentro, %s nada sai", async (_, confirmacao, mensagem) => {
    montarExemplo();
    expect(await excluirLista("pl1", confirmacao)).toEqual({ error: mensagem });
    expect(apagouAlgo).not.toHaveBeenCalled();
    expect(itens).toHaveLength(6);
    expect(arquivosApagados).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("a tarefa vazia sai sem pedir o nome, e também fica na auditoria", async () => {
    expect(await excluirLista("pl1")).toBeNull();
    expect(tarefas).toEqual(["pl2"]);
    expect(arquivosApagados).toEqual([]);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "kanban.tarefa.excluir",
      metadata: { name: "Conciliações de Abril", setor: "bpo", atividades: 0, subatividades: 0, anexos: 0 },
    }));
  });

  it("se o banco recusa, a mensagem diz que nada saiu e nenhum arquivo é apagado", async () => {
    montarExemplo();
    prisma.pipeline.delete.mockRejectedValueOnce(new Error("caiu"));
    expect(await excluirLista("pl1", "Conciliações de Abril")).toEqual({ error: "Erro ao excluir a tarefa. Nada foi apagado." });
    expect(itens).toHaveLength(6);
    expect(documentos).toHaveLength(5);
    expect(arquivosApagados).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("excluirLista — o que continua travando", () => {
  it.each([
    ["recurringObligations", "Esta tarefa é destino de obrigações recorrentes. Aponte-as para outra tarefa antes de excluí-la."],
    ["modelosDeObrigacao", "Esta tarefa é destino de obrigações por regime. Aponte-as para outra tarefa antes de excluí-la."],
    ["assuntosDeSolicitacao", "Solicitações de clientes viram cartão nesta tarefa. Mude a lista dos assuntos em Configurações › Portal do cliente › Assuntos das solicitações antes de excluí-la."],
  ] as const)("%s: recusa mesmo com o nome digitado, e nada sai", async (trava, mensagem) => {
    montarExemplo();
    travas[trava] = 1;
    expect(await excluirLista("pl1", "Conciliações de Abril")).toEqual({ error: mensagem });
    expect(apagouAlgo).not.toHaveBeenCalled();
    expect(arquivosApagados).toEqual([]);
  });

  it("só o administrador exclui: o coordenador do setor não apaga nada", async () => {
    montarExemplo();
    ctx.role = "SECTOR_ADMIN";
    ctx.sectors = ["bpo"];
    expect(await excluirLista("pl1", "Conciliações de Abril")).toHaveProperty("error");
    expect(apagouAlgo).not.toHaveBeenCalled();
  });

  it("tarefa de outro escritório não é achada", async () => {
    montarExemplo();
    ctx.tenantId = "t2";
    try {
      expect(await excluirLista("pl1", "Conciliações de Abril")).toEqual({ error: "Tarefa não encontrada." });
      expect(apagouAlgo).not.toHaveBeenCalled();
    } finally {
      ctx.tenantId = "t1";
    }
  });
});
