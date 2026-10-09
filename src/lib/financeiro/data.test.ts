import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa (08/10): a lista de contas da equipe parava em mil linhas sem
// `orderBy`, e o recorte e os totais saíam dessas mil — acima disso, contas
// sumiam da lista e do topo sem aviso. Agora o recorte vai para o banco, a
// ordem é estável, os totais e as contagens não têm teto, e a lista diz quando
// parou.
const findMany = vi.fn();
const count = vi.fn();
const aggregate = vi.fn();
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ financeEntry: { findMany, count, aggregate } }) }));

const { listarContas, whereDoRecorte, LIMITE_DE_CONTAS } = await import("./data");

const decimal = (s: string) => ({ toString: () => s });
// 08/10/2026 às 12h em São Paulo.
const AGORA = new Date("2026-10-08T15:00:00Z");
const HOJE = new Date("2026-10-08T00:00:00-03:00");

let seq = 0;
function entrada(over: { dueDate: string; status?: string; paidAt?: Date | null; amount?: string }) {
  seq += 1;
  return {
    id: `e${String(seq).padStart(4, "0")}`,
    status: over.status ?? "CONFERIDO",
    amount: decimal(over.amount ?? "100.00"),
    dueDate: new Date(`${over.dueDate}T12:00:00-03:00`),
    paidAt: over.paidAt ?? null,
    competence: "2026-10",
    description: null,
    fiscalDocumentId: null,
    approvalStatus: "NAO_REQUER",
    closeReason: null,
    agreementId: null,
    company: { id: "c1", name: "Empresa", displayName: null },
    counterparty: { name: "Fornecedor" },
    category: { name: "Aluguel" },
    costCenterId: null,
    costCenter: null,
  };
}

/** Os quatro `aggregate` de `totaisDoEscopo`: pagas, vencidas, de hoje, a vencer. */
function somasDoBanco(pago: string, vencido: string, hoje: string, aVencer: string) {
  aggregate
    .mockResolvedValueOnce({ _sum: { amount: decimal(pago) }, _min: { paidAt: null } })
    .mockResolvedValueOnce({ _sum: { amount: decimal(vencido) } })
    .mockResolvedValueOnce({ _sum: { amount: decimal(hoje) } })
    .mockResolvedValueOnce({ _sum: { amount: decimal(aVencer) } });
}

beforeEach(() => {
  vi.resetAllMocks();
  seq = 0;
});

describe("whereDoRecorte", () => {
  const abertas = { paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] } };

  it("em aberto: nem paga nem cancelada", () => {
    expect(whereDoRecorte("abertas", "2026-10-08")).toEqual(abertas);
  });

  it("vencidas: em aberto com vencimento antes do começo de hoje em São Paulo", () => {
    expect(whereDoRecorte("vencidas", "2026-10-08")).toEqual({ ...abertas, dueDate: { lt: HOJE } });
  });

  it("a vencer começa à meia-noite de amanhã em Brasília, sem pagas/canceladas", () => {
    expect(whereDoRecorte("avencer", "2026-10-08")).toEqual({ ...abertas, dueDate: { gte: new Date("2026-10-09T00:00:00-03:00") } });
  });
  it("vence hoje inclui o começo de hoje e exclui o de amanhã", () => {
    expect(whereDoRecorte("hoje", "2026-10-08")).toEqual({ ...abertas, dueDate: { gte: HOJE, lt: new Date("2026-10-09T00:00:00-03:00") } });
  });
  it("a janela de hoje atravessa a virada do mês corretamente", () => {
    expect(whereDoRecorte("hoje", "2026-10-31")).toEqual({ ...abertas, dueDate: { gte: new Date("2026-10-31T00:00:00-03:00"), lt: new Date("2026-11-01T00:00:00-03:00") } });
  });

  it("todas: sem cláusula", () => {
    expect(whereDoRecorte("todas", "2026-10-08")).toEqual({});
  });
});

describe("listarContas", () => {
  it("leva o recorte para o banco, com ordem estável e teto só na lista", async () => {
    findMany.mockResolvedValueOnce([entrada({ dueDate: "2026-10-01" })]);
    count.mockResolvedValueOnce(5_000).mockResolvedValueOnce(1);
    somasDoBanco("0", "100.00", "0", "0");

    await listarContas("t1", "PAGAR", { recorte: "vencidas", empresaId: "c1", competencia: "2026-10" }, AGORA);

    const doFiltro = { tenantId: "t1", kind: "PAGAR", competence: "2026-10", companyId: "c1" };
    expect(findMany).toHaveBeenCalledTimes(1);
    const consulta = findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({ ...doFiltro, ...whereDoRecorte("vencidas", "2026-10-08") });
    expect(consulta.orderBy).toEqual([{ dueDate: "asc" }, { id: "asc" }]);
    expect(consulta.take).toBe(LIMITE_DE_CONTAS);

    // As contagens: o filtro sem o recorte (o "nada neste recorte") e o recorte.
    expect(count.mock.calls[0][0]).toEqual({ where: doFiltro });
    expect(count.mock.calls[1][0]).toEqual({ where: { ...doFiltro, ...whereDoRecorte("vencidas", "2026-10-08") } });

    // Os totais: somados no banco, sem teto, no mesmo filtro.
    for (const [chamada] of aggregate.mock.calls) {
      expect(chamada).not.toHaveProperty("take");
      expect(chamada.where).toMatchObject({ tenantId: "t1", kind: "PAGAR", competence: "2026-10", companyId: { in: ["c1"] } });
    }
  });

  it("os totais são do recorte inteiro, não das linhas que vieram, e a lista avisa que parou", async () => {
    // O banco devolve só uma das 1.500 em aberto (o teto, encolhido no teste).
    findMany.mockResolvedValueOnce([entrada({ dueDate: "2026-10-01", amount: "10.00" })]);
    count.mockResolvedValueOnce(9_000).mockResolvedValueOnce(1_500);
    somasDoBanco("50000.00", "1200.00", "300.00", "4500.00");

    const r = await listarContas("t1", "RECEBER", {}, AGORA);

    expect(r.totais).toEqual({ vencido: 120_000, venceHoje: 30_000, aVencer: 450_000, pago: 0, emAberto: 600_000 });
    expect(r.totalGeral).toBe(9_000);
    expect(r.totalNoRecorte).toBe(1_500);
    expect(r.limitada).toBe(true);
    // Sem filtro de competência nem de empresa, nenhuma das duas chaves entra.
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", kind: "RECEBER", ...whereDoRecorte("abertas", "2026-10-08") });
  });

  it("não avisa quando a lista traz o recorte inteiro", async () => {
    findMany.mockResolvedValueOnce([entrada({ dueDate: "2026-10-08" }), entrada({ dueDate: "2026-10-20" })]);
    count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    somasDoBanco("0", "0", "100.00", "100.00");

    const r = await listarContas("t1", "PAGAR", { recorte: "abertas" }, AGORA);

    expect(r.limitada).toBe(false);
    expect(r.linhas.map((l) => l.situacao)).toEqual(["VENCE_HOJE", "A_VENCER"]);
  });

  it("em todas, as em aberto primeiro e o histórico completa até o teto, do mais recente", async () => {
    const abertas = [entrada({ dueDate: "2026-09-30" }), entrada({ dueDate: "2026-10-15" })];
    const pagas = [entrada({ dueDate: "2026-10-05", status: "PAGO", paidAt: new Date("2026-10-05T15:00:00Z") })];
    findMany.mockResolvedValueOnce(abertas).mockResolvedValueOnce(pagas);
    count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    somasDoBanco("100.00", "100.00", "0", "100.00");

    const r = await listarContas("t1", "PAGAR", { recorte: "todas" }, AGORA);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", kind: "PAGAR", ...whereDoRecorte("abertas", "2026-10-08") });
    const historico = findMany.mock.calls[1][0];
    expect(historico.where).toEqual({
      tenantId: "t1",
      kind: "PAGAR",
      OR: [{ status: { in: ["CANCELADO", "PAGO"] } }, { paidAt: { not: null } }],
    });
    expect(historico.orderBy).toEqual([{ dueDate: "desc" }, { id: "desc" }]);
    expect(historico.take).toBe(LIMITE_DE_CONTAS - abertas.length);

    expect(r.linhas.map((l) => l.situacao)).toEqual(["VENCIDA", "A_VENCER", "PAGA"]);
    expect(r.totais.pago).toBe(10_000);
    expect(r.limitada).toBe(false);
  });

  it("em todas, com a fila já no teto, nem busca o histórico", async () => {
    findMany.mockResolvedValueOnce(Array.from({ length: LIMITE_DE_CONTAS }, () => entrada({ dueDate: "2026-10-20" })));
    count.mockResolvedValueOnce(4_000).mockResolvedValueOnce(4_000);
    somasDoBanco("0", "0", "0", "100000.00");

    const r = await listarContas("t1", "PAGAR", { recorte: "todas" }, AGORA);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(r.linhas).toHaveLength(LIMITE_DE_CONTAS);
    expect(r.limitada).toBe(true);
  });
});
