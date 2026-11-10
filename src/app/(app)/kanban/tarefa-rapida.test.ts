import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// "+ Nova tarefa" sem formulário (05/11/2026): a tarefa nasce só com o nome, na
// coluna em que foi criada, e nada mais vem definido — sem datas, prioridade,
// responsáveis, etiquetas, descrição nem empresa. O resto se preenche no
// detalhe.

const pipeline = { findFirst: vi.fn() };
const pipelineStage = { findFirst: vi.fn() };
const pipelineItem = { create: vi.fn(async () => ({ id: "novo" })) };
const activity = { create: vi.fn() };
// A permissão de quem cria: hoje pelo bloqueio por setor; com a permissão do
// espaço (PR à parte), pelo espaço. As duas leituras liberam aqui.
const sectorQuadrosBloqueados = { findUnique: vi.fn(async () => null) };
const space = { findUnique: vi.fn(async () => ({ defaultPermission: "EDITAR" })) };
// A tarefa nasce numa transação, com o número do endereço curto (10/11/2026):
// com o contador da tela em 0, o número é 1.
const prisma: Record<string, unknown> = { pipeline, pipelineStage, pipelineItem, activity, sectorQuadrosBloqueados, space, $queryRaw: async () => [{ ultimo: 0 }], $executeRaw: async () => 1 };
prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
// As ações do Kanban chegam a módulos `server-only` (exclusão de atividade, SPED local).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

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

const { criarTarefaRapida } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  ctx.role = "SECTOR_USER";
  ctx.sectors = ["bpo"];
  pipeline.findFirst.mockResolvedValue({ id: "pl1", tenantId: "t1", sectorCode: "bpo", spaceId: "s1", folderId: null });
  pipelineStage.findFirst.mockResolvedValue({ id: "st2", pipelineId: "pl1", name: "Em andamento" });
});

describe("criarTarefaRapida", () => {
  it("cria só com o nome, na coluna escolhida — nada mais definido", async () => {
    await criarTarefaRapida("pl1", "st2", "  Conferir extrato de outubro  ");
    expect(pipelineItem.create).toHaveBeenCalledTimes(1);
    expect(pipelineItem.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", number: 1, pipelineId: "pl1", stageId: "st2", title: "Conferir extrato de outubro" },
    });
    // O histórico diz onde ela nasceu.
    expect(activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pipelineItemId: "novo", type: "CREATED", content: 'Criado em "Em andamento"' }),
    });
  });

  it("a coluna tem de ser desta lista", async () => {
    await criarTarefaRapida("pl1", "st2", "Conferir");
    expect(pipelineStage.findFirst).toHaveBeenCalledWith({ where: { id: "st2", pipelineId: "pl1" } });

    vi.clearAllMocks();
    pipeline.findFirst.mockResolvedValue({ id: "pl1", tenantId: "t1", sectorCode: "bpo", spaceId: "s1", folderId: null });
    pipelineStage.findFirst.mockResolvedValue(null);
    await criarTarefaRapida("pl1", "coluna-de-outra-lista", "Conferir");
    expect(pipelineItem.create).not.toHaveBeenCalled();
  });

  it("nome em branco não cria", async () => {
    await criarTarefaRapida("pl1", "st2", "   ");
    expect(pipelineItem.create).not.toHaveBeenCalled();
  });

  it("quem só vê não cria", async () => {
    ctx.role = "READONLY";
    ctx.sectors = [];
    await criarTarefaRapida("pl1", "st2", "Conferir");
    expect(pipelineItem.create).not.toHaveBeenCalled();
  });

  it("quem é de outro setor não cria", async () => {
    ctx.sectors = ["dp"];
    await criarTarefaRapida("pl1", "st2", "Conferir");
    expect(pipelineItem.create).not.toHaveBeenCalled();
  });
});
