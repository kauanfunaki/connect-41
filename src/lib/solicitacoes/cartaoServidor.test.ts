import { beforeEach, describe, expect, it, vi } from "vitest";

// A solicitação vira cartão (09/11/2026): o cartão nasce uma vez só, na coluna
// "não iniciada" da lista do assunto, e anda com o status da solicitação.

const serviceRequest = { findFirst: vi.fn() };
const pipeline = { findFirst: vi.fn() };
const pipelineItem = { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
const activity = { create: vi.fn() };
const prisma = { serviceRequest, pipeline, pipelineItem, activity };

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { criarCartaoDaSolicitacao, moverCartaoDaSolicitacao } = await import("./cartaoServidor");

const SOLICITACAO = {
  id: "sr1",
  number: 12,
  companyId: "c1",
  assigneeId: "resp",
  description: "Preciso do contrato social.",
  subject: { label: "Pedir um documento", cardPipelineId: "pl1" },
  company: { name: "Empresa Exemplo Ltda", displayName: "Empresa Exemplo" },
  cartao: null,
};
const COLUNAS = [
  { id: "resolvida", name: "Resolvida", order: 3, type: "DONE" },
  { id: "nova", name: "Nova", order: 0, type: "NOT_STARTED" },
  { id: "atendimento", name: "Em atendimento", order: 1, type: "IN_PROGRESS" },
  { id: "aguardando", name: "Aguardando cliente", order: 2, type: "PENDING" },
];

beforeEach(() => {
  vi.clearAllMocks();
  serviceRequest.findFirst.mockResolvedValue(SOLICITACAO);
  pipeline.findFirst.mockResolvedValue({ id: "pl1", stages: COLUNAS });
  pipelineItem.create.mockResolvedValue({ id: "i1" });
});

describe("criarCartaoDaSolicitacao", () => {
  it("cria o cartão na coluna Nova, com a empresa, o responsável e o vínculo", async () => {
    await criarCartaoDaSolicitacao("t1", "sr1");
    expect(serviceRequest.findFirst.mock.calls[0][0].where).toEqual({ id: "sr1", tenantId: "t1" });
    expect(pipeline.findFirst.mock.calls[0][0].where).toEqual({ id: "pl1", tenantId: "t1", active: true });
    expect(pipelineItem.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        pipelineId: "pl1",
        stageId: "nova",
        entityType: "COMPANY",
        entityId: "c1",
        title: "Pedir um documento — Empresa Exemplo",
        description: expect.stringContaining("Preciso do contrato social."),
        serviceRequestId: "sr1",
        assignees: { create: [{ userId: "resp" }] },
      },
      select: { id: true },
    });
  });

  it("assunto desligado, lista sumida ou cartão já criado: não cria", async () => {
    serviceRequest.findFirst.mockResolvedValueOnce({ ...SOLICITACAO, subject: { ...SOLICITACAO.subject, cardPipelineId: null } });
    await criarCartaoDaSolicitacao("t1", "sr1");
    serviceRequest.findFirst.mockResolvedValueOnce({ ...SOLICITACAO, cartao: { id: "i0" } });
    await criarCartaoDaSolicitacao("t1", "sr1");
    pipeline.findFirst.mockResolvedValueOnce(null);
    await criarCartaoDaSolicitacao("t1", "sr1");
    expect(pipelineItem.create).not.toHaveBeenCalled();
  });

  it("duas chamadas ao mesmo tempo: o índice único barra a segunda, sem erro para quem abriu", async () => {
    pipelineItem.create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    await expect(criarCartaoDaSolicitacao("t1", "sr1")).resolves.toBeUndefined();
  });

  it("falha qualquer no quadro não chega a quem abriu a solicitação", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    pipelineItem.create.mockRejectedValueOnce(new Error("banco fora"));
    await expect(criarCartaoDaSolicitacao("t1", "sr1")).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe("moverCartaoDaSolicitacao", () => {
  const cartao = (stageId: string, status: string) => ({
    id: "i1",
    pipelineId: "pl1",
    stageId,
    stage: { name: COLUNAS.find((c) => c.id === stageId)!.name },
    serviceRequest: { number: 12, status },
    pipeline: { stages: COLUNAS },
  });

  it("leva o cartão à coluna do status e assina o histórico com quem agiu", async () => {
    pipelineItem.findFirst.mockResolvedValue(cartao("nova", "AGUARDANDO_CLIENTE"));
    await moverCartaoDaSolicitacao("t1", "sr1", "eu");
    expect(pipelineItem.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t1", serviceRequestId: "sr1" });
    expect(pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "aguardando" } });
    expect(activity.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "t1",
      pipelineItemId: "i1",
      userId: "eu",
      type: "STATUS_CHANGE",
      content: 'Movido de "Nova" para "Aguardando cliente" pela Solicitação nº 12',
    });
  });

  it("quando foi o cliente, move sem histórico (o histórico exige um usuário do escritório)", async () => {
    pipelineItem.findFirst.mockResolvedValue(cartao("resolvida", "EM_ANDAMENTO"));
    await moverCartaoDaSolicitacao("t1", "sr1", null);
    expect(pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "atendimento" } });
    expect(activity.create).not.toHaveBeenCalled();
  });

  it("já na coluna certa, ou sem cartão: nada", async () => {
    pipelineItem.findFirst.mockResolvedValueOnce(cartao("resolvida", "CANCELADA"));
    await moverCartaoDaSolicitacao("t1", "sr1", "eu");
    pipelineItem.findFirst.mockResolvedValueOnce(null);
    await moverCartaoDaSolicitacao("t1", "sr1", "eu");
    expect(pipelineItem.update).not.toHaveBeenCalled();
  });
});
