import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  user: { findMany: vi.fn() },
  activity: { groupBy: vi.fn() },
  processStep: { groupBy: vi.fn() },
  handoff: { groupBy: vi.fn() },
  auditLog: { groupBy: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
const itensDaGestao = vi.fn();
vi.mock("@/lib/gestao/itens", () => ({ itensDaGestao: (...a: unknown[]) => itensDaGestao(...a) }));

const { FERRAMENTAS_DA_EQUIPE, diaPedido, limitesDoDia } = await import("./ferramentas-equipe");
const executar = FERRAMENTAS_DA_EQUIPE.atividade_da_equipe!.executar!;

const ANA = "0b6c2f7e-1d3a-4c5b-9e8f-112233445566";
const ctx = (equipe: string) => ({ tenantId: "t1", userId: "u-coord", escopo: { equipe } });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findMany.mockResolvedValue([{ id: ANA, name: "Ana Lima" }]);
  prisma.activity.groupBy.mockResolvedValue([
    { userId: ANA, type: "STATUS_CHANGE", _count: { _all: 4 } },
    { userId: ANA, type: "NOTE", _count: { _all: 2 } },
  ]);
  prisma.processStep.groupBy.mockResolvedValue([{ executedByUserId: ANA, _count: { _all: 3 } }]);
  prisma.handoff.groupBy.mockResolvedValue([]);
  prisma.auditLog.groupBy.mockResolvedValue([{ userId: ANA, _count: { _all: 9 } }]);
  itensDaGestao.mockResolvedValue([
    { item: { responsaveis: [ANA], concluidoEm: new Date("2026-10-02T15:00:00Z") }, c: { coluna: "CONCLUIDO", parado: null, paradoDeProposito: false } },
    { item: { responsaveis: [ANA], concluidoEm: null }, c: { coluna: "EM_ANDAMENTO", parado: 6, paradoDeProposito: false } },
    { item: { responsaveis: [ANA], concluidoEm: null }, c: { coluna: "EM_ANDAMENTO", parado: 9, paradoDeProposito: true } },
  ]);
});

describe("atividade da equipe", () => {
  it("o dia é o de São Paulo: hoje, ontem ou uma data passada", () => {
    const agora = new Date("2026-10-02T01:00:00Z"); // ainda 01/10 em São Paulo
    expect(diaPedido("hoje", agora)).toBe("2026-10-01");
    expect(diaPedido("ontem", agora)).toBe("2026-09-30");
    expect(diaPedido("2026-09-15", agora)).toBe("2026-09-15");
    expect(diaPedido("2027-01-01", agora)).toBe("2026-10-01"); // futuro não existe
    expect(limitesDoDia("2026-10-02")).toEqual({ inicio: new Date("2026-10-02T03:00:00Z"), fim: new Date("2026-10-03T03:00:00Z") });
  });

  it("sem recorte da equipe no escopo, recusa — e não toca no banco", async () => {
    await expect(executar({ dia: "hoje", pessoa: "" }, ctx(""))).rejects.toThrow(/coordenação/);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("junta por pessoa, só nos setores do escopo, com o jeito de citar", async () => {
    const r = (await executar({ dia: "2026-10-02", pessoa: "" }, ctx("dp"))) as {
      pessoas: Record<string, unknown>[];
    };
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", sectors: { some: { sectorCode: { in: ["dp"] } } } });
    expect(prisma.activity.groupBy.mock.calls[0][0].where.pipelineItem).toEqual({ pipeline: { sectorCode: { in: ["dp"] } } });
    expect(itensDaGestao).toHaveBeenCalledWith("t1", ["dp"]);
    expect(r.pessoas[0]).toMatchObject({
      id: ANA,
      citar: `@[Ana Lima](usuario:${ANA})`,
      cardsMovidos: 4,
      comentarios: 2,
      etapasDeProcessoConcluidas: 3,
      acoesRegistradas: 9,
      itensConcluidosNoDia: 1,
      // O pausado de propósito não conta como parado.
      paradosComEla: 1,
    });
  });
});
