import { beforeEach, describe, expect, it, vi } from "vitest";

// A sincronia processo → cartão (27/11/2026, funcionalidade-844), com o banco
// falso: cria o cartão na lista de destino, na coluna da situação, e depois só
// grava o que difere.

const COLUNAS = [
  { id: "andamento", name: "Em andamento", order: 0, type: "IN_PROGRESS", systemKey: "EM_ANDAMENTO" },
  { id: "orgao", name: "Aguardando órgão", order: 1, type: "PENDING", systemKey: "AGUARDANDO_ORGAO" },
  { id: "concluido", name: "Concluído", order: 5, type: "DONE", systemKey: "CONCLUIDO" },
  { id: "cancelado", name: "Cancelado/Indeferido", order: 6, type: "DONE", systemKey: "CANCELADO" },
];

const base = {
  id: "p1",
  tenantId: "t1",
  number: 12,
  companyId: "e1",
  title: null,
  status: "EM_ANDAMENTO",
  priority: "ALTA",
  ownerUserId: "u1",
  concludedAt: null,
  type: { name: "Baixa" },
  company: { name: "Empresa Exemplo", displayName: null },
  protocols: [] as { organId: string; attempt: number; outcome: string }[],
  cartao: null as unknown,
};

const tx = {
  pipelineItem: { create: vi.fn(async () => ({ id: "i1" })), update: vi.fn() },
  pipelineItemAssignee: { deleteMany: vi.fn(), upsert: vi.fn() },
  activity: { create: vi.fn() },
};
const prisma = {
  process: { findUnique: vi.fn() },
  aberturaAutomatica: { findUnique: vi.fn(async () => null) },
  pipeline: { findFirst: vi.fn(async () => ({ id: "pl1", stages: COLUNAS })), create: vi.fn() },
  ...tx,
  $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
};

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/modules", () => ({ setorDoModulo: vi.fn(async () => "societario"), isModuleEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/enderecoCurtoNumeracao", () => ({
  criarComNumero: (_tela: string, _t: string, criar: (t: typeof tx, n: number) => Promise<unknown>) => criar(tx, 77),
}));

const { sincronizarCartaoDoProcesso } = await import("./cartaoDoProcessoServidor");

beforeEach(() => vi.clearAllMocks());

describe("sincronizarCartaoDoProcesso", () => {
  it("processo sem cartão ganha um, na coluna da situação, com o responsável e a prioridade dele", async () => {
    prisma.process.findUnique.mockResolvedValue({ ...base, protocols: [{ organId: "j", attempt: 1, outcome: "PENDENTE" }] });
    await sincronizarCartaoDoProcesso("p1");
    expect(tx.pipelineItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: 77,
        pipelineId: "pl1",
        stageId: "orgao",
        entityType: "COMPANY",
        entityId: "e1",
        title: "Nº 12 · Baixa — Empresa Exemplo",
        priority: 1,
        processId: "p1",
        assignees: { create: [{ userId: "u1" }] },
      }),
      select: { id: true },
    });
  });

  it("abertura desligada no setor: não cria", async () => {
    prisma.aberturaAutomatica.findUnique.mockResolvedValueOnce({ ativo: false, pipelineId: null } as never);
    prisma.process.findUnique.mockResolvedValue(base);
    await sincronizarCartaoDoProcesso("p1");
    expect(tx.pipelineItem.create).not.toHaveBeenCalled();
  });

  const cartao = (over: Record<string, unknown> = {}) => ({
    id: "i1",
    pipelineId: "pl1",
    stageId: "andamento",
    title: "Nº 12 · Baixa — Empresa Exemplo",
    priority: 1,
    entityId: "e1",
    stage: { name: "Em andamento" },
    assignees: [{ userId: "u1" }],
    pipeline: { stages: COLUNAS },
    ...over,
  });

  it("cartão que já espelha o processo: nada é gravado", async () => {
    prisma.process.findUnique.mockResolvedValue({ ...base, cartao: cartao() });
    await sincronizarCartaoDoProcesso("p1", { userId: "eu" });
    expect(tx.pipelineItem.update).not.toHaveBeenCalled();
    expect(tx.activity.create).not.toHaveBeenCalled();
  });

  it("processo cancelado leva o cartão à coluna final, com o histórico em nome de quem agiu", async () => {
    prisma.process.findUnique.mockResolvedValue({ ...base, status: "CANCELADO", ownerUserId: "u2", cartao: cartao() });
    await sincronizarCartaoDoProcesso("p1", { userId: "eu" });
    expect(tx.pipelineItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { stageId: "cancelado" } });
    expect(tx.pipelineItemAssignee.deleteMany).toHaveBeenCalledWith({ where: { pipelineItemId: "i1", userId: { in: ["u1"] } } });
    expect(tx.pipelineItemAssignee.upsert).toHaveBeenCalledTimes(1);
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "eu", type: "STATUS_CHANGE", content: 'Movido de "Em andamento" para "Cancelado/Indeferido" pelo Processo nº 12' }),
    });
  });

  it("falha no banco não sobe para quem chamou", async () => {
    prisma.process.findUnique.mockRejectedValue(new Error("caiu"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sincronizarCartaoDoProcesso("p1")).resolves.toBeUndefined();
    erro.mockRestore();
  });
});
