import { beforeEach, describe, expect, it, vi } from "vitest";

// O que o agendador grava nas séries sem número de vezes (21/10): só as
// contas novas até o horizonte, copiando a última conta não cancelada, sem
// criar duas vezes; e a série que ficou sem conta nenhuma para de nascer.

const m = vi.hoisted(() => {
  const tx = {
    financeRecurrence: { updateMany: vi.fn() },
    financeEntry: { createMany: vi.fn() },
  };
  const db = {
    financeRecurrence: { findMany: vi.fn(), updateMany: vi.fn() },
    financeEntry: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db, tx, gravarRateio: vi.fn(), rateioDaConta: vi.fn(), registrarEnvios: vi.fn(), logAudit: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/feriados", () => ({ feriadosDoEscritorio: async () => new Map() }));
vi.mock("./aprovacao/servidor", () => ({
  contextoDeEntrada: async () => ({ statusInicial: () => "NAO_REQUER" }),
  registrarEnvios: m.registrarEnvios,
}));
vi.mock("./rateioServidor", () => ({ rateioDaConta: m.rateioDaConta, gravarRateio: m.gravarRateio }));

import { estenderSeries, repeticaoDaSerie } from "./repeticaoServidor";

const SERIE = {
  id: "s1",
  tenantId: "t1",
  companyId: "c1",
  frequency: "MENSAL",
  dayAdjust: "MANTER",
  endMode: "SEM_FIM",
  endDate: null,
  total: null,
  firstDueDate: "2026-10-10",
  firstCompetence: "2026-10",
  // Nasceu em 21/10 com o horizonte de 12 meses: 10/2026 a 10/2027.
  lastIndex: 13,
  active: true,
  createdById: "u1",
};

const MODELO = {
  id: "e13",
  kind: "PAGAR",
  counterpartyId: "imobiliaria",
  categoryId: "aluguel",
  costCenterId: null,
  projectId: null,
  bankAccountId: "itau",
  amount: { toString: () => "1500.00" },
  description: "Aluguel",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.db.financeRecurrence.findMany.mockResolvedValue([SERIE]);
  m.db.financeEntry.findFirst.mockResolvedValue(MODELO);
  m.tx.financeRecurrence.updateMany.mockResolvedValue({ count: 1 });
  m.rateioDaConta.mockResolvedValue([]);
});

describe("estenderSeries", () => {
  it("cria só as que entraram no horizonte, copiando a última conta, e anda a série", async () => {
    // Um mês depois: o horizonte foi para 21/11/2027, e nasce a de 10/11/2027.
    const r = await estenderSeries({ hojeKey: "2026-11-21" });
    expect(r).toEqual({ series: 1, criadas: 1 });
    expect(m.tx.financeRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", active: true, lastIndex: 13 },
      data: { lastIndex: 14 },
    });
    const criadas = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(criadas).toHaveLength(1);
    expect(criadas[0]).toMatchObject({
      companyId: "c1",
      counterpartyId: "imobiliaria",
      categoryId: "aluguel",
      bankAccountId: "itau",
      competence: "2027-11",
      recurrenceId: "s1",
      recurrenceIndex: 14,
      recurrenceTotal: null,
      createdById: "u1",
    });
    expect(criadas[0].dueDate.toISOString().slice(0, 10)).toBe("2027-11-10");
  });

  it("sem nada novo no horizonte, não grava nada", async () => {
    const r = await estenderSeries({ hojeKey: "2026-10-25" });
    expect(r).toEqual({ series: 0, criadas: 0 });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("outra passada que andou antes não cria as mesmas de novo", async () => {
    m.tx.financeRecurrence.updateMany.mockResolvedValue({ count: 0 });
    const r = await estenderSeries({ hojeKey: "2026-11-21" });
    expect(r).toEqual({ series: 0, criadas: 0 });
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
  });

  it("até a data, não passa dela; a série completa fica parada", async () => {
    m.db.financeRecurrence.findMany.mockResolvedValue([
      { ...SERIE, endMode: "ATE", endDate: "2027-12-10", total: 15, lastIndex: 13 },
      { ...SERIE, id: "s2", endMode: "ATE", endDate: "2027-10-10", total: 13, lastIndex: 13 },
    ]);
    const r = await estenderSeries({ hojeKey: "2027-06-01" });
    expect(r).toEqual({ series: 1, criadas: 2 });
    const criadas = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(criadas.map((c: { recurrenceIndex: number }) => c.recurrenceIndex)).toEqual([14, 15]);
    expect(criadas[0].recurrenceTotal).toBe(15);
  });

  it("a série com todas as contas canceladas para de nascer", async () => {
    m.db.financeEntry.findFirst.mockResolvedValue(null);
    await estenderSeries({ hojeKey: "2026-11-21" });
    expect(m.db.financeRecurrence.updateMany).toHaveBeenCalledWith({ where: { id: "s1", active: true }, data: { active: false } });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("o rateio da conta copiada vai para cada conta nova", async () => {
    const linhas = [{ categoriaId: "aluguel", centroId: "loja-a", projetoId: null, centavos: 90000 }];
    m.rateioDaConta.mockResolvedValue(linhas);
    await estenderSeries({ hojeKey: "2026-11-21" });
    expect(m.gravarRateio).toHaveBeenCalledWith(m.tx, expect.objectContaining({ tenantId: "t1", linhas }));
  });
});

describe("repeticaoDaSerie", () => {
  it("devolve a regra, e nada para a linha sem sentido", () => {
    expect(repeticaoDaSerie({ frequency: "DIARIA", dayAdjust: "ADIAR", endMode: "SEM_FIM", endDate: null })).toEqual({
      frequencia: "DIARIA",
      ajuste: "ADIAR",
      fim: { tipo: "SEM_FIM" },
    });
    expect(repeticaoDaSerie({ frequency: "MENSAL", dayAdjust: "ADIAR", endMode: "ATE", endDate: null })).toBeNull();
  });
});
