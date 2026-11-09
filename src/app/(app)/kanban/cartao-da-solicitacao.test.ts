import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// O cartão de uma solicitação do cliente movido à mão (09/11/2026): na coluna
// concluída conclui a solicitação pelas regras dela; tirá-lo da concluída com a
// solicitação encerrada é recusado; entre as abertas, anda livre.

const COLUNAS = {
  nova: { id: "nova", name: "Nova", order: 0, type: "NOT_STARTED", isTerminal: false, pipelineId: "pl1" },
  atendimento: { id: "atendimento", name: "Em atendimento", order: 1, type: "IN_PROGRESS", isTerminal: false, pipelineId: "pl1" },
  resolvida: { id: "resolvida", name: "Resolvida", order: 3, type: "DONE", isTerminal: true, pipelineId: "pl1" },
} as const;

const pipeline = { findFirst: vi.fn() };
const pipelineItem = { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
const pipelineStage = {
  findUnique: vi.fn(async ({ where }: { where: { id: keyof typeof COLUNAS } }) => COLUNAS[where.id] ?? null),
  findFirst: vi.fn(),
  findMany: vi.fn(async () => [{ id: "resolvida" }]),
};
const activity = { create: vi.fn(), createMany: vi.fn() };
const serviceRequest = { findFirst: vi.fn() };
const space = { findUnique: vi.fn(async () => ({ defaultPermission: "EDITAR" })) };
const prisma = { pipeline, pipelineItem, pipelineStage, activity, serviceRequest, space };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: vi.fn(async () => true) }));
const concluirSolicitacao = vi.fn();
vi.mock("@/app/(app)/solicitacoes/actions", () => ({ concluirSolicitacao: (id: string) => concluirSolicitacao(id) }));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_USER" as UserRole,
  sectors: ["fiscal"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
}));

const { moverItem, concluirTarefa, reabrirTarefa } = await import("./actions");

const CARTAO = { id: "i1", tenantId: "t1", pipelineId: "pl1", stageId: "atendimento", parentItemId: null, title: "Pedir um documento — Empresa", serviceRequestId: "sr1" };
const solicitacao = (status: string, sectorCode = "fiscal") => ({ number: 12, status, sectorCode, assigneeId: null });

beforeEach(() => {
  vi.clearAllMocks();
  ctx.sectors = ["fiscal"];
  pipeline.findFirst.mockResolvedValue({ id: "pl1", sectorCode: "fiscal", spaceId: "s1", folderId: null });
  pipelineItem.findFirst.mockResolvedValue(CARTAO);
  concluirSolicitacao.mockResolvedValue({ ok: true, aviso: null });
});

describe("moverItem — cartão de solicitação", () => {
  it("na coluna concluída: move e conclui a solicitação pela ação dela", async () => {
    serviceRequest.findFirst.mockResolvedValue(solicitacao("EM_ANDAMENTO"));
    expect(await moverItem("i1", "resolvida")).toBeUndefined();
    expect(serviceRequest.findFirst.mock.calls[0][0].where).toEqual({ id: "sr1", tenantId: "t1" });
    expect(pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "resolvida" } });
    expect(concluirSolicitacao).toHaveBeenCalledWith("sr1");
  });

  it("entre as colunas abertas: só move", async () => {
    pipelineItem.findFirst.mockResolvedValue({ ...CARTAO, stageId: "nova" });
    serviceRequest.findFirst.mockResolvedValue(solicitacao("ABERTA"));
    expect(await moverItem("i1", "atendimento")).toBeUndefined();
    expect(pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "atendimento" } });
    expect(concluirSolicitacao).not.toHaveBeenCalled();
  });

  it("solicitação encaminhada a outro setor: recusa sem mover", async () => {
    serviceRequest.findFirst.mockResolvedValue(solicitacao("EM_ANDAMENTO", "contabil"));
    const r = await moverItem("i1", "resolvida");
    expect(r).toEqual({ error: expect.stringContaining("Solicitação nº 12, que está com outro setor") });
    expect(pipelineItem.update).not.toHaveBeenCalled();
    expect(concluirSolicitacao).not.toHaveBeenCalled();
  });

  it("solicitação encerrada: o cartão não sai da concluída", async () => {
    pipelineItem.findFirst.mockResolvedValue({ ...CARTAO, stageId: "resolvida" });
    serviceRequest.findFirst.mockResolvedValue(solicitacao("CONCLUIDA"));
    const r = await moverItem("i1", "atendimento");
    expect(r).toEqual({ error: expect.stringContaining("reabra a solicitação") });
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });

  it("a solicitação recusa a conclusão: ela recoloca o cartão e a recusa volta", async () => {
    serviceRequest.findFirst.mockResolvedValue(solicitacao("EM_ANDAMENTO"));
    concluirSolicitacao.mockResolvedValue({ error: "A solicitação acabou de mudar — atualize a página." });
    // A releitura do cartão pela solicitação: já na concluída, e ela segue em andamento.
    pipelineItem.findFirst.mockResolvedValueOnce(CARTAO).mockResolvedValueOnce({
      id: "i1",
      pipelineId: "pl1",
      stageId: "resolvida",
      stage: { name: "Resolvida" },
      serviceRequest: { number: 12, status: "EM_ANDAMENTO" },
      pipeline: { stages: Object.values(COLUNAS) },
    });
    const r = await moverItem("i1", "resolvida");
    expect(r).toEqual({ error: "A solicitação acabou de mudar — atualize a página." });
    expect(pipelineItem.update).toHaveBeenLastCalledWith({ where: { id: "i1" }, data: { stageId: "atendimento" } });
  });

  it("cartão sem solicitação: nada muda no caminho de sempre", async () => {
    pipelineItem.findFirst.mockResolvedValue({ ...CARTAO, serviceRequestId: null });
    expect(await moverItem("i1", "resolvida")).toBeUndefined();
    expect(serviceRequest.findFirst).not.toHaveBeenCalled();
    expect(concluirSolicitacao).not.toHaveBeenCalled();
  });
});

describe("concluirTarefa e reabrirTarefa — cartão de solicitação", () => {
  it("concluir pelo botão também conclui a solicitação", async () => {
    pipelineStage.findFirst.mockResolvedValue(COLUNAS.resolvida);
    serviceRequest.findFirst.mockResolvedValue(solicitacao("AGUARDANDO_CLIENTE"));
    expect(await concluirTarefa("pl1", "i1")).toBeUndefined();
    expect(pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "resolvida" } });
    expect(concluirSolicitacao).toHaveBeenCalledWith("sr1");
  });

  it("concluir sem poder concluir a solicitação: avisa e não conclui", async () => {
    ctx.sectors = ["fiscal"];
    pipelineStage.findFirst.mockResolvedValue(COLUNAS.resolvida);
    serviceRequest.findFirst.mockResolvedValue(solicitacao("EM_ANDAMENTO", "dp"));
    expect(await concluirTarefa("pl1", "i1")).toEqual({ error: expect.stringContaining("outro setor") });
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });

  it("reabrir o cartão de uma solicitação encerrada é recusado", async () => {
    pipelineItem.findFirst.mockResolvedValue({ ...CARTAO, stageId: "resolvida" });
    pipelineStage.findFirst.mockResolvedValue(COLUNAS.nova);
    serviceRequest.findFirst.mockResolvedValue(solicitacao("CANCELADA"));
    expect(await reabrirTarefa("pl1", "i1")).toEqual({ error: expect.stringContaining("está cancelada") });
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });
});
