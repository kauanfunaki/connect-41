import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// O cartão de um processo societário no quadro (27/11/2026, funcionalidade-844):
// o processo manda na coluna, no responsável, na prioridade e no prazo. Mover
// para outra coluna do sistema, concluir, reabrir, trocar responsável ou
// prioridade e excluir pelo quadro são recusados; comentário e o resto, livres.

const COLUNAS = [
  { id: "andamento", name: "Em andamento", order: 0, type: "IN_PROGRESS", isTerminal: false, systemKey: "EM_ANDAMENTO", pipelineId: "pl1" },
  { id: "orgao", name: "Aguardando órgão", order: 1, type: "PENDING", isTerminal: false, systemKey: "AGUARDANDO_ORGAO", pipelineId: "pl1" },
  { id: "exigencia", name: "Em exigência", order: 2, type: "IN_PROGRESS", isTerminal: false, systemKey: "EM_EXIGENCIA", pipelineId: "pl1" },
  { id: "concluido", name: "Concluído", order: 5, type: "DONE", isTerminal: true, systemKey: "CONCLUIDO", pipelineId: "pl1" },
] as const;

const pipeline = { findFirst: vi.fn() };
const pipelineItem = { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
const pipelineItemAssignee = { upsert: vi.fn(), delete: vi.fn() };
const pipelineStage = {
  findUnique: vi.fn(async ({ where }: { where: { id: string } }) => COLUNAS.find((c) => c.id === where.id) ?? null),
  findFirst: vi.fn(async () => COLUNAS[3]),
  findMany: vi.fn(async () => COLUNAS),
};
const activity = { create: vi.fn(), createMany: vi.fn() };
const processo = { findFirst: vi.fn() };
const space = { findUnique: vi.fn(async () => ({ defaultPermission: "EDITAR" })) };
const user = { findFirst: vi.fn(async () => ({ id: "u2" })), findUnique: vi.fn() };
const prisma = { pipeline, pipelineItem, pipelineItemAssignee, pipelineStage, activity, process: processo, space, user };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: vi.fn(async () => true), setorDoModulo: vi.fn(async () => "societario") }));
vi.mock("@/app/(app)/solicitacoes/actions", () => ({ concluirSolicitacao: vi.fn() }));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "ADMIN" as UserRole,
  sectors: ["societario"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
}));

const { moverItem, concluirTarefa, reabrirTarefa, atualizarPrazoPrioridade, alternarResponsavelItem, excluirItem } = await import("./actions");

const CARTAO = { id: "i1", tenantId: "t1", pipelineId: "pl1", stageId: "andamento", parentItemId: null, title: "Nº 12 · Baixa — Empresa", serviceRequestId: null, processId: "p1" };
const emAndamento = { number: 12, status: "EM_ANDAMENTO", concludedAt: null, protocols: [] };

beforeEach(() => {
  vi.clearAllMocks();
  pipeline.findFirst.mockResolvedValue({ id: "pl1", sectorCode: "societario", spaceId: "s1", folderId: null });
  pipelineItem.findFirst.mockResolvedValue(CARTAO);
  processo.findFirst.mockResolvedValue(emAndamento);
});

describe("cartão de processo no quadro", () => {
  it("arrastar para outra coluna do sistema é recusado com o caminho, sem mover", async () => {
    const r = await moverItem("i1", "concluido");
    expect(r).toEqual({ error: "A coluna deste cartão segue a situação do Processo nº 12. Para mudar, registre no processo." });
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });

  it("concluir e reabrir pelo quadro também são recusados", async () => {
    expect(await concluirTarefa("pl1", "i1")).toEqual({ error: expect.stringContaining("registre no processo") });
    pipelineItem.findFirst.mockResolvedValue({ ...CARTAO, stageId: "concluido" });
    expect(await reabrirTarefa("pl1", "i1")).toEqual({ error: expect.stringContaining("registre no processo") });
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });

  it("prazo e prioridade vêm do processo", async () => {
    pipelineItem.findFirst.mockResolvedValue({ dueDate: null, priority: 0, processId: "p1" });
    const form = new FormData();
    form.set("priority", "2");
    expect(await atualizarPrazoPrioridade("pl1", "i1", null, form)).toEqual({ error: "O prazo e a prioridade deste cartão vêm do Processo nº 12. Mude no processo." });
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });

  it("responsável não se troca no cartão, e o cartão não se exclui pelo quadro", async () => {
    await alternarResponsavelItem("pl1", "i1", "u2", true);
    expect(pipelineItemAssignee.upsert).not.toHaveBeenCalled();
    await excluirItem("pl1", "i1");
    // Sai antes de apagar: sem exclusão, sem a volta para o quadro.
    expect(redirect).not.toHaveBeenCalled();
  });

  it("cartão comum segue movendo como antes", async () => {
    pipelineItem.findFirst.mockResolvedValue({ ...CARTAO, processId: null });
    expect(await moverItem("i1", "concluido")).toBeUndefined();
    expect(pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "concluido" } });
  });
});
