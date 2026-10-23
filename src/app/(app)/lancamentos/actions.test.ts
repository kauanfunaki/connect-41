import { beforeEach, describe, expect, it, vi } from "vitest";

// O parcelamento no lançamento manual (22/10/2026): o valor é o total, cada
// parcela vira uma conta com o valor e o vencimento conferidos na tela, todas
// na mesma série ("3/12") e na competência da compra (ou, desde 23/10/2026, na
// do vencimento de cada parcela); e o que não combina com
// parcelar (repetir, rateio, retenção, já pago) é recusado sem gravar.

const m = vi.hoisted(() => {
  const tx = {
    financeCounterparty: { create: vi.fn(), update: vi.fn() },
    financeEntry: { create: vi.fn(), createMany: vi.fn() },
    financeRecurrence: { create: vi.fn() },
    financeEntryAttachment: { createMany: vi.fn() },
  };
  const db = {
    company: { findFirst: vi.fn() },
    financeCategory: { findFirst: vi.fn() },
    financeCounterparty: { findFirst: vi.fn() },
    agentRun: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db, tx, logAudit: vi.fn(), registrarEnvios: vi.fn(), avisarAprovadores: vi.fn(), statusInicial: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }), canActOnSector: () => true }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => ["bpo"] }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/feriados", () => ({ feriadosDoEscritorio: async () => new Map() }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => null }));
vi.mock("@/lib/financeiro/aprovacao/servidor", () => ({
  contextoDeEntrada: async () => ({ statusInicial: m.statusInicial }),
  registrarEnvios: m.registrarEnvios,
  avisarAprovadores: m.avisarAprovadores,
}));
vi.mock("@/lib/financeiro/centroDeCustoServidor", () => ({ centroNaCriacao: async () => ({ ok: true, centroId: null }) }));
vi.mock("@/lib/financeiro/projetoServidor", () => ({ projetoInformado: async () => ({ ok: true, projetoId: null }) }));
vi.mock("@/lib/financeiro/contaPrevistaServidor", () => ({ contaPrevistaInformada: async () => ({ ok: true, contaId: null }) }));
vi.mock("@/lib/financeiro/baixa/servidor", () => ({ quitarConta: vi.fn() }));
vi.mock("@/lib/financeiro/rateioServidor", () => ({ conferirRateio: vi.fn(), gravarRateio: vi.fn() }));
vi.mock("@/lib/financeiro/retencoesServidor", () => ({ aplicarRetencoes: vi.fn(), cancelarContasDosImpostos: vi.fn(), RecusaDaRetencao: class extends Error {} }));
vi.mock("@/lib/financeiro/anexos", () => ({ armazenamentoDosAnexos: { gravarAnexos: vi.fn(), apagarAnexosGravados: vi.fn() } }));

const { criarLancamentoManual } = await import("./actions");

const PARCELAS = [
  { vencimento: "2026-10-22", centavos: 33334 },
  { vencimento: "2026-11-23", centavos: 33333 },
  { vencimento: "2026-12-22", centavos: 33333 },
];

function form(campos: Record<string, string> = {}) {
  const f = new FormData();
  const base: Record<string, string> = {
    companyId: "c1",
    kind: "PAGAR",
    competencia: "2026-10",
    vencimento: "2026-10-22",
    valor: "1.000,00",
    descricao: "Notebook",
    numeroDocumento: "NF 123",
    categoryId: "equipamentos",
    counterpartyId: "loja",
    parcelar: "1",
    parcelas: JSON.stringify(PARCELAS),
    parcelarAjuste: "ADIAR",
    ...campos,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.db.company.findFirst.mockResolvedValue({ id: "c1" });
  m.db.financeCategory.findFirst.mockResolvedValue({ id: "equipamentos" });
  m.db.financeCounterparty.findFirst.mockResolvedValue({ id: "loja", defaultCategoryId: "equipamentos", defaultCostCenterId: null });
  m.tx.financeEntry.create.mockResolvedValue({ id: "e1", amount: "333.34" });
  m.statusInicial.mockReturnValue("NAO_REQUER");
});

describe("criarLancamentoManual parcelado", () => {
  it("cria uma conta por parcela, na mesma série e competência, com o valor e o vencimento de cada uma", async () => {
    const r = await criarLancamentoManual(form());
    expect(r).toEqual({ ok: true, aguardandoAprovacao: false, repetidas: 0, parcelas: 3, impostos: 0 });

    const primeira = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(primeira).toMatchObject({ amount: "333.34", competence: "2026-10", recurrenceIndex: 1, recurrenceTotal: 3, documentNumber: "NF 123" });
    expect(primeira.dueDate.toISOString().slice(0, 10)).toBe("2026-10-22");

    const proximas = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(proximas.map((p: { amount: string }) => p.amount)).toEqual(["333.33", "333.33"]);
    expect(proximas.map((p: { recurrenceIndex: number }) => p.recurrenceIndex)).toEqual([2, 3]);
    expect(proximas.map((p: { dueDate: Date }) => p.dueDate.toISOString().slice(0, 10))).toEqual(["2026-11-23", "2026-12-22"]);
    for (const p of proximas) {
      expect(p).toMatchObject({ competence: "2026-10", recurrenceId: primeira.recurrenceId, recurrenceTotal: 3, documentNumber: "NF 123", status: "CONFERIDO" });
    }

    expect(m.tx.financeRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: primeira.recurrenceId,
        frequency: "MENSAL",
        dayAdjust: "ADIAR",
        endMode: "VEZES",
        total: 3,
        firstDueDate: "2026-10-22",
        lastIndex: 3,
      }),
    });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financeiro.entry.created_manual",
        metadata: expect.objectContaining({ parcelamento: expect.objectContaining({ parcelas: 3, total: "1000.00" }) }),
      })
    );
  });

  // 23/10/2026: a competência pode ser a do vencimento de cada parcela.
  it("com a competência do vencimento, cada parcela fica no mês em que vence — a primeira também", async () => {
    const r = await criarLancamentoManual(form({ competencia: "2026-09", parcelarCompetencia: "VENCIMENTO" }));
    expect(r).toMatchObject({ ok: true, parcelas: 3 });
    const primeira = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(primeira.competence).toBe("2026-10");
    const proximas = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(proximas.map((p: { competence: string }) => p.competence)).toEqual(["2026-11", "2026-12"]);
    expect(m.tx.financeRecurrence.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firstCompetence: "2026-10" }) });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ parcelamento: expect.objectContaining({ competencia: "VENCIMENTO" }) }) })
    );
  });

  it("com a competência da compra (ou sem o campo, o formulário de antes), todas ficam na digitada", async () => {
    for (const campos of [{ parcelarCompetencia: "COMPRA" }, {}] as Record<string, string>[]) {
      vi.clearAllMocks();
      m.tx.financeEntry.create.mockResolvedValue({ id: "e1", amount: "333.34" });
      await criarLancamentoManual(form({ competencia: "2026-09", ...campos }));
      expect(m.tx.financeEntry.create.mock.calls[0]![0].data.competence).toBe("2026-09");
      expect(m.tx.financeEntry.createMany.mock.calls[0]![0].data.map((p: { competence: string }) => p.competence)).toEqual(["2026-09", "2026-09"]);
    }
  });

  it("recusa uma competência das parcelas que não é das duas, sem gravar", async () => {
    const r = await criarLancamentoManual(form({ parcelarCompetencia: "2026-11" }));
    expect(r).toMatchObject({ error: expect.stringContaining("competência das parcelas") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("com alçada, cada parcela vai para a aprovação com o valor dela", async () => {
    m.statusInicial.mockReturnValue("AGUARDANDO");
    m.avisarAprovadores.mockResolvedValue({ enviados: 1, semSmtp: false });
    await criarLancamentoManual(form());
    expect(m.avisarAprovadores.mock.calls[0]![1].map((c: { amount: { toString(): string } }) => c.amount.toString())).toEqual([
      "333.34",
      "333.33",
      "333.33",
    ]);
  });

  it("recusa a soma que não fecha com o total, sem gravar", async () => {
    const r = await criarLancamentoManual(form({ valor: "1.000,01" }));
    expect(r).toMatchObject({ error: expect.stringContaining("ajuste uma delas") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ repetirFrequencia: "MENSAL", repetirVezes: "3" }, "repetir"],
    [{ pagoEm: "2026-10-01" }, "aberto"],
    [{ comRateio: "1", rateio: JSON.stringify([{ categoriaId: "equipamentos", centavos: 60000 }, { categoriaId: "moveis", centavos: 40000 }]) }, "Rateio"],
    [{ "retencao:IRRF": "15,00" }, "Retenção"],
  ])("recusa parcelar junto com %o", async (campos, trecho) => {
    const r = await criarLancamentoManual(form(campos as Record<string, string>));
    expect(r).toMatchObject({ error: expect.stringContaining(trecho) });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("sem parcelar, a conta nasce como antes, fora de série", async () => {
    const r = await criarLancamentoManual(form({ parcelar: "0" }));
    expect(r).toMatchObject({ ok: true, repetidas: 0 });
    expect(r).not.toHaveProperty("parcelas");
    expect(m.tx.financeEntry.create.mock.calls[0]![0].data).toMatchObject({ amount: "1000.00" });
    expect(m.tx.financeEntry.create.mock.calls[0]![0].data).not.toHaveProperty("recurrenceId");
    expect(m.tx.financeRecurrence.create).not.toHaveBeenCalled();
  });
});
