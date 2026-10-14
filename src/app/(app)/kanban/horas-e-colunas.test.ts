import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Corrigir hora apontada (13/10/2026): com a exclusão restrita ao
// administrador, quem apontou — ou o gestor do setor — corrige pelo "Editar".
// E tirar coluna do quadro passou a ser exclusão: o gestor renomeia, cria e
// reordena, mas não tira.

const pipeline = { findFirst: vi.fn() };
const timeEntry = { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() };
const activity = { create: vi.fn() };
const pipelineStage = { findMany: vi.fn(), delete: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() };
const prisma = {
  pipeline,
  timeEntry,
  activity,
  pipelineStage,
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ pipelineStage })),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

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
}));

const { editarLancamentoTempo, excluirLancamentoTempo, atualizarEstagios } = await import("./actions");

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  ctx.role = "SECTOR_USER";
  ctx.sectors = ["bpo"];
  pipeline.findFirst.mockResolvedValue({ id: "pl1", sectorCode: "bpo", spaceId: "s1", folderId: null });
});

describe("editarLancamentoTempo", () => {
  it("quem apontou corrige duração, dia e nota", async () => {
    timeEntry.findFirst.mockResolvedValue({ userId: "eu", minutes: 480 });
    const r = await editarLancamentoTempo("pl1", "i1", "te1", null, form({ horas: "1", minutos: "30", dia: "2026-10-10", nota: "conferência" }));
    expect(r).toEqual({ ok: true });
    expect(timeEntry.findFirst.mock.calls[0][0].where).toEqual({ id: "te1", tenantId: "t1", pipelineItemId: "i1", pipelineItem: { pipelineId: "pl1" } });
    expect(timeEntry.update).toHaveBeenCalledWith({
      where: { id: "te1" },
      data: { minutes: 90, note: "conferência", loggedOn: new Date(Date.UTC(2026, 9, 10, 12)) },
    });
    // A correção fica no histórico do card.
    expect(activity.create.mock.calls[0][0].data.content).toBe("Apontamento corrigido: 8h → 1h30min");
  });

  it("colaborador não corrige o apontamento de outra pessoa", async () => {
    timeEntry.findFirst.mockResolvedValue({ userId: "colega", minutes: 60 });
    const r = await editarLancamentoTempo("pl1", "i1", "te1", null, form({ horas: "2" }));
    expect(r).toEqual({ error: "Só quem apontou ou o gestor do setor corrige este apontamento." });
    expect(timeEntry.update).not.toHaveBeenCalled();
  });

  it("o gestor do setor corrige o de qualquer um", async () => {
    ctx.role = "SECTOR_ADMIN";
    timeEntry.findFirst.mockResolvedValue({ userId: "colega", minutes: 60 });
    expect(await editarLancamentoTempo("pl1", "i1", "te1", null, form({ horas: "2" }))).toEqual({ ok: true });
    expect(timeEntry.update).toHaveBeenCalled();
  });

  it("Somente leitura e quem é de outro setor não corrigem", async () => {
    timeEntry.findFirst.mockResolvedValue({ userId: "eu", minutes: 60 });
    ctx.role = "READONLY";
    expect(await editarLancamentoTempo("pl1", "i1", "te1", null, form({ horas: "2" }))).toHaveProperty("error");
    ctx.role = "SECTOR_USER";
    ctx.sectors = ["dp"];
    expect(await editarLancamentoTempo("pl1", "i1", "te1", null, form({ horas: "2" }))).toHaveProperty("error");
    expect(timeEntry.update).not.toHaveBeenCalled();
  });

  it("formulário inválido não chega ao banco", async () => {
    expect(await editarLancamentoTempo("pl1", "i1", "te1", null, form({ horas: "0", minutos: "0" }))).toHaveProperty("error");
    expect(timeEntry.findFirst).not.toHaveBeenCalled();
  });
});

describe("excluirLancamentoTempo", () => {
  it("nem o autor apaga mais; o administrador apaga", async () => {
    timeEntry.findFirst.mockResolvedValue({ id: "te1" });
    expect(await excluirLancamentoTempo("pl1", "i1", "te1")).toEqual({ error: "Só o Administrador ou o Super Admin pode excluir." });
    ctx.role = "SECTOR_ADMIN";
    expect(await excluirLancamentoTempo("pl1", "i1", "te1")).toHaveProperty("error");
    expect(timeEntry.delete).not.toHaveBeenCalled();
    ctx.role = "ADMIN";
    expect(await excluirLancamentoTempo("pl1", "i1", "te1")).toEqual({ ok: true });
    expect(timeEntry.delete).toHaveBeenCalledWith({ where: { id: "te1" } });
  });
});

describe("atualizarEstagios — tirar coluna", () => {
  const existentes = [
    { id: "e1", name: "A fazer", _count: { items: 0 } },
    { id: "e2", name: "Feito", _count: { items: 0 } },
  ];

  it("o gestor renomeia e cria coluna", async () => {
    ctx.role = "SECTOR_ADMIN";
    pipelineStage.findMany.mockResolvedValue(existentes);
    const r = await atualizarEstagios("pl1", [
      { id: "e1", name: "Para fazer", color: "#586577", type: "NOT_STARTED" },
      { id: "e2", name: "Feito", color: "#059669", type: "DONE" },
      { name: "Revisão", color: "#2563EB", type: "NOT_STARTED" },
    ]);
    expect(r).toBeNull();
    expect(pipelineStage.create).toHaveBeenCalledTimes(1);
    expect(pipelineStage.delete).not.toHaveBeenCalled();
  });

  it("o gestor não tira coluna; o administrador tira", async () => {
    pipelineStage.findMany.mockResolvedValue(existentes);
    const sem = [{ id: "e1", name: "A fazer", color: "#586577", type: "NOT_STARTED" as const }];
    ctx.role = "SECTOR_ADMIN";
    expect(await atualizarEstagios("pl1", sem)).toEqual({
      error: 'Só o Administrador ou o Super Admin pode excluir. Peça a ele para tirar a coluna "Feito".',
    });
    expect(pipelineStage.delete).not.toHaveBeenCalled();
    ctx.role = "ADMIN";
    expect(await atualizarEstagios("pl1", sem)).toBeNull();
    expect(pipelineStage.delete).toHaveBeenCalledWith({ where: { id: "e2" } });
  });
});
