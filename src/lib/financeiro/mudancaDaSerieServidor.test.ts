import { beforeEach, describe, expect, it, vi } from "vitest";

// Mudar a série daqui em diante (22/10/2026): grava só nas contas em aberto
// desta posição em diante, com a trava de estado; a conta do Omie antes da
// virada é recusada; o dia novo vai para a regra; a aprovada que muda de
// valor volta para a aprovação; e tudo numa linha de auditoria.

const m = vi.hoisted(() => {
  const tx = {
    financeEntry: { updateMany: vi.fn() },
    financeRecurrence: { update: vi.fn() },
  };
  const db = {
    financeEntry: { findFirst: vi.fn(), findMany: vi.fn() },
    financeEntryAllocation: { findMany: vi.fn() },
    financeRecurrence: { findFirst: vi.fn() },
    financeCategory: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    db,
    tx,
    ctx: { tenantId: "t1", userId: "u1" },
    podeEditar: vi.fn(),
    foco: vi.fn(),
    logAudit: vi.fn(),
    registrarEnvios: vi.fn(),
    avisarAprovadores: vi.fn(),
    statusInicial: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/feriados", () => ({ feriadosDoEscritorio: async () => new Map() }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: m.foco }));
vi.mock("./acessoDaConta", () => ({ podeEditarOTipo: m.podeEditar }));
vi.mock("./aprovacao/servidor", () => ({
  contextoDeEntrada: async () => ({ statusInicial: m.statusInicial }),
  registrarEnvios: m.registrarEnvios,
  avisarAprovadores: m.avisarAprovadores,
}));

const { mudarSerieDaquiEmDiante, dadosDaMudancaDaSerie } = await import("./mudancaDaSerieServidor");

const dec = (v: string) => ({ toString: () => v });
const instante = (k: string) => new Date(`${k}T15:00:00Z`);

const CONTA = {
  id: "e2",
  companyId: "c1",
  kind: "PAGAR",
  amount: dec("1500.00"),
  categoryId: "aluguel",
  description: "Aluguel",
  dueDate: instante("2026-11-10"),
  recurrenceId: "s1",
  recurrenceIndex: 2,
  recurrenceTotal: null,
  omieTitleId: null,
  omieMovementId: null,
  counterparty: { name: "Imobiliária" },
  company: { omieCutoverAt: null },
};

function daSerie(indice: number, p: Record<string, unknown> = {}) {
  return {
    id: `e${indice}`,
    recurrenceIndex: indice,
    status: "CONFERIDO",
    paidAt: null,
    closeReason: null,
    fiscalDocumentId: null,
    agreementId: null,
    omieTitleId: null,
    omieMovementId: null,
    omieDepartmentId: null,
    omieReconciledAt: null,
    paidPrincipal: dec("0"),
    cardAccountId: null,
    approvalStatus: "NAO_REQUER",
    amount: dec("1500.00"),
    categoryId: "aluguel",
    description: "Aluguel",
    dueDate: instante(`2026-${String(9 + indice).padStart(2, "0")}-10`),
    updatedAt: new Date(`2026-10-0${indice}T00:00:00Z`),
    bankMatches: [],
    retentionOrigin: null,
    company: { omieCutoverAt: null },
    ...p,
  };
}

const REGRA = { id: "s1", frequency: "MENSAL", dayAdjust: "MANTER", endMode: "SEM_FIM", firstDueDate: "2026-10-10", active: true };

function form(campos: Record<string, string>) {
  const f = new FormData();
  f.set("entryId", "e2");
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.podeEditar.mockResolvedValue({ ctx: m.ctx, erro: null });
  m.foco.mockResolvedValue(null);
  m.db.financeEntry.findFirst.mockResolvedValue(CONTA);
  // A 2 e a 3 em aberto; a 4 paga adiantada.
  m.db.financeEntry.findMany.mockResolvedValue([
    daSerie(2),
    daSerie(3),
    daSerie(4, { status: "PAGO", paidAt: instante("2026-10-20"), paidPrincipal: dec("1500.00") }),
  ]);
  m.db.financeEntryAllocation.findMany.mockResolvedValue([]);
  m.db.financeRecurrence.findFirst.mockResolvedValue(REGRA);
  m.db.financeCategory.findFirst.mockResolvedValue({ id: "aluguel-novo" });
  m.db.financeCategory.findMany.mockResolvedValue([{ id: "aluguel", name: "Aluguel" }]);
  m.tx.financeEntry.updateMany.mockResolvedValue({ count: 1 });
  m.statusInicial.mockReturnValue("NAO_REQUER");
  m.avisarAprovadores.mockResolvedValue({ enviados: 1, semSmtp: false });
});

describe("mudarSerieDaquiEmDiante", () => {
  it("muda o valor desta e das próximas em aberto, com a trava de estado, e audita", async () => {
    const r = await mudarSerieDaquiEmDiante(form({ valor: "1.650,00" }));
    expect(r).toMatchObject({ ok: true, mudaram: 2, ficaram: 1 });
    expect(m.tx.financeEntry.updateMany).toHaveBeenCalledTimes(2);
    expect(m.tx.financeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "e2", tenantId: "t1", updatedAt: daSerie(2).updatedAt },
      data: { amount: "1650.00" },
    });
    expect(m.tx.financeRecurrence.update).not.toHaveBeenCalled();
    // A última da série (paga) ficou: as que nascerem copiam dela — a tela avisa.
    if ("ok" in r) expect(r.aviso).toContain("A última conta da série ficou como estava");
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financeiro.entry.series_changed",
        entityId: "e2",
        metadata: expect.objectContaining({ serie: "s1", aPartirDe: 2, mudaram: 2, contas: ["e2", "e3"], pedido: { valor: "1650.00", valorAntes: "1500.00" } }),
      })
    );
  });

  it("o dia novo muda o vencimento das em aberto pelo mês da regra e vai para a regra", async () => {
    const r = await mudarSerieDaquiEmDiante(form({ dia: "20" }));
    expect(r).toMatchObject({ ok: true, mudaram: 2 });
    const datas = m.tx.financeEntry.updateMany.mock.calls.map((c) => c[0].data.dueDate.toISOString().slice(0, 10));
    expect(datas).toEqual(["2026-11-20", "2026-12-20"]);
    expect(m.tx.financeRecurrence.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { dueDay: 20 } });
  });

  it("a conta que mudou no meio (paga, editada) fica e conta nas que ficaram", async () => {
    m.tx.financeEntry.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await mudarSerieDaquiEmDiante(form({ descricao: "Aluguel reajustado" }));
    expect(r).toMatchObject({ ok: true, mudaram: 1, ficaram: 2 });
  });

  it("a conta a pagar aprovada que muda de valor volta para a aprovação", async () => {
    m.db.financeEntry.findMany.mockResolvedValue([daSerie(2, { approvalStatus: "APROVADO" }), daSerie(3)]);
    m.statusInicial.mockReturnValue("AGUARDANDO");
    const r = await mudarSerieDaquiEmDiante(form({ valor: "1.650,00" }));
    expect(r).toMatchObject({ ok: true, mudaram: 2 });
    expect(m.tx.financeEntry.updateMany.mock.calls[0]![0].data).toMatchObject({ approvalStatus: "AGUARDANDO", approvedAt: null });
    expect(m.tx.financeEntry.updateMany.mock.calls[1]![0].data).not.toHaveProperty("approvalStatus");
    expect(m.registrarEnvios).toHaveBeenCalledWith(m.tx, ["e2"], "u1");
    expect(m.avisarAprovadores).toHaveBeenCalledTimes(1);
  });

  it("recusa a conta do Omie antes da virada, sem gravar", async () => {
    m.db.financeEntry.findFirst.mockResolvedValue({ ...CONTA, omieTitleId: "123" });
    const r = await mudarSerieDaquiEmDiante(form({ valor: "1.650,00" }));
    expect(r).toEqual({ error: expect.stringContaining("Omie") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("depois da virada, a do Omie muda como as outras", async () => {
    m.db.financeEntry.findFirst.mockResolvedValue({ ...CONTA, omieTitleId: "123", company: { omieCutoverAt: new Date() } });
    expect(await mudarSerieDaquiEmDiante(form({ descricao: "x" }))).toMatchObject({ ok: true });
  });

  it("respeita a permissão e o foco", async () => {
    m.podeEditar.mockResolvedValue({ ctx: null, erro: "Sem permissão em contas a pagar." });
    expect(await mudarSerieDaquiEmDiante(form({ valor: "1,00" }))).toEqual({ error: "Sem permissão em contas a pagar." });
    m.podeEditar.mockResolvedValue({ ctx: m.ctx, erro: null });
    m.foco.mockResolvedValue("Fora do foco.");
    expect(await mudarSerieDaquiEmDiante(form({ valor: "1,00" }))).toEqual({ error: "Fora do foco." });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("recusa a conta fora de série, o dia na série semanal e a categoria de fora do plano", async () => {
    m.db.financeEntry.findFirst.mockResolvedValueOnce({ ...CONTA, recurrenceId: null, recurrenceIndex: null });
    expect(await mudarSerieDaquiEmDiante(form({ valor: "1,00" }))).toMatchObject({ error: expect.stringContaining("série") });
    m.db.financeRecurrence.findFirst.mockResolvedValueOnce({ ...REGRA, frequency: "SEMANAL" });
    expect(await mudarSerieDaquiEmDiante(form({ dia: "5" }))).toMatchObject({ error: expect.stringContaining("mensal ou anual") });
    m.db.financeCategory.findFirst.mockResolvedValueOnce(null);
    expect(await mudarSerieDaquiEmDiante(form({ categoryId: "outra" }))).toMatchObject({ error: expect.stringContaining("Categoria") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("sem nenhuma conta que possa mudar, diz o porquê", async () => {
    m.db.financeEntry.findMany.mockResolvedValue([daSerie(2, { bankMatches: [{ id: "b" }] })]);
    const r = await mudarSerieDaquiEmDiante(form({ valor: "1,00" }));
    expect(r).toMatchObject({ error: expect.stringContaining("Conciliada") });
  });
});

describe("dadosDaMudancaDaSerie", () => {
  it("diz quantas estão em aberto, se o dia pode mudar e se nascem sozinhas", async () => {
    const r = await dadosDaMudancaDaSerie("e2");
    expect(r).toMatchObject({ ok: true, emAberto: 2, dia: { pode: true }, nascemSozinhas: true, conta: { posicao: "2/∞", valor: "1.500,00", dia: 10 } });
  });

  it("a série antiga, sem regra e mensal: o dia muda, e a janela diz como", async () => {
    m.db.financeRecurrence.findFirst.mockResolvedValue(null);
    serieAntiga(MENSAL_QUE_ANTECIPA);
    const r = await dadosDaMudancaDaSerie("e2");
    expect(r).toMatchObject({ ok: true, dia: { pode: true, aviso: expect.stringContaining("antecipam") }, nascemSozinhas: false });
  });

  it("a série antiga semanal, ou que não diz de quanto em quanto repete, não muda o dia", async () => {
    m.db.financeRecurrence.findFirst.mockResolvedValue(null);
    serieAntiga([antiga(1, "2026-10-05"), antiga(2, "2026-10-12"), antiga(3, "2026-10-19")]);
    expect(await dadosDaMudancaDaSerie("e2")).toMatchObject({ ok: true, dia: { pode: false, motivo: expect.stringContaining("mensal ou anual") } });
    serieAntiga([antiga(2, "2026-11-10")]);
    expect(await dadosDaMudancaDaSerie("e2")).toMatchObject({ ok: true, dia: { pode: false, motivo: expect.stringContaining("antes de 21/10") } });
  });
});

// A série antiga, sem regra (22/10/2026): a frequência e o ajuste vêm das
// contas dela (todas — a consulta sem `recurrenceIndex`); as em aberto desta
// em diante mudam no mês que já têm.
const antiga = (indice: number, vencimentoKey: string) => ({ recurrenceIndex: indice, dueDate: instante(vencimentoKey), competence: vencimentoKey.slice(0, 7) });
// 10/10/2026 é sábado: a série antecipou para sexta, 09/10.
const MENSAL_QUE_ANTECIPA = [antiga(1, "2026-10-09"), antiga(2, "2026-11-10"), antiga(3, "2026-12-10")];

function serieAntiga(todas: ReturnType<typeof antiga>[]) {
  m.db.financeEntry.findMany.mockImplementation(async ({ where }: { where: { recurrenceIndex?: unknown } }) =>
    where.recurrenceIndex ? [daSerie(2, { competence: "2026-11" }), daSerie(3, { competence: "2026-12" })] : todas
  );
}

describe("mudar o dia na série antiga, sem regra", () => {
  it("mensal: cada conta em aberto no mês dela, no dia novo, com o ajuste que a série usava — sem regra para gravar", async () => {
    m.db.financeRecurrence.findFirst.mockResolvedValue(null);
    serieAntiga(MENSAL_QUE_ANTECIPA);
    const r = await mudarSerieDaquiEmDiante(form({ dia: "15" }));
    expect(r).toMatchObject({ ok: true, mudaram: 2 });
    const datas = m.tx.financeEntry.updateMany.mock.calls.map((c) => c[0].data.dueDate.toISOString().slice(0, 10));
    // 15/11/2026 é domingo: antecipa para sexta, 13/11.
    expect(datas).toEqual(["2026-11-13", "2026-12-15"]);
    expect(m.tx.financeRecurrence.update).not.toHaveBeenCalled();
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ pedido: { dia: 15 }, serieSemRegra: { frequencia: "MENSAL", ajuste: "ANTECIPAR" } }) })
    );
  });

  it("semanal: recusa com a explicação de sempre, sem gravar", async () => {
    m.db.financeRecurrence.findFirst.mockResolvedValue(null);
    serieAntiga([antiga(1, "2026-10-05"), antiga(2, "2026-10-12"), antiga(3, "2026-10-19")]);
    expect(await mudarSerieDaquiEmDiante(form({ dia: "5" }))).toMatchObject({ error: expect.stringContaining("mensal ou anual") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("com a regra sem dia guardado, o dia novo vai para ela", async () => {
    m.db.financeRecurrence.findFirst.mockResolvedValue({ ...REGRA, dayAdjust: "ADIAR" });
    const r = await mudarSerieDaquiEmDiante(form({ dia: "15" }));
    expect(r).toMatchObject({ ok: true });
    expect(m.tx.financeRecurrence.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { dueDay: 15 } });
  });
});
