import { beforeEach, describe, expect, it, vi } from "vitest";

// A conta a pagar da nota de compra nasce das duplicatas (23/10, "parado
// #22"): o que `lancarDocumento` grava com duas duplicatas, com uma, com
// duplicatas que não fecham e sem duplicata; que o segundo lançamento não cria
// parcela nenhuma; e que o estorno leva a série inteira — ou não leva nada.
// Desde a decisão de 23/10 (1:N), todas as parcelas são ligadas à nota, cada
// uma na sua posição (`fiscalDocumentInstallment`), e as travas da conta da
// nota valem para cada uma.

const m = vi.hoisted(() => {
  const tx = {
    financeCounterparty: { create: vi.fn(), update: vi.fn() },
    financeEntry: { create: vi.fn(), createMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    financeRecurrence: { create: vi.fn(), deleteMany: vi.fn() },
    fiscalDocument: { update: vi.fn() },
  };
  const db = {
    financeCounterparty: { findFirst: vi.fn() },
    financeCategory: { findFirst: vi.fn() },
    financeEntry: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    db,
    tx,
    obterDocumento: vi.fn(),
    logAudit: vi.fn(),
    registrarEnvios: vi.fn(),
    avisarAprovadores: vi.fn(),
    statusInicial: vi.fn(() => "NAO_REQUER"),
    cancelarContasDosImpostos: vi.fn(),
    aplicarRetencoes: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }),
  canActOnSector: () => true,
  canManageSector: () => true,
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => null }));
vi.mock("@/lib/fiscal/data", () => ({ obterDocumento: m.obterDocumento }));
vi.mock("@/lib/financeiro/retencoesServidor", () => ({
  aplicarRetencoes: m.aplicarRetencoes,
  cancelarContasDosImpostos: m.cancelarContasDosImpostos,
  RecusaDaRetencao: class extends Error {},
}));
vi.mock("@/lib/financeiro/aprovacao/servidor", () => ({
  contextoDeEntrada: async () => ({ statusInicial: m.statusInicial }),
  registrarEnvios: m.registrarEnvios,
  avisarAprovadores: m.avisarAprovadores,
}));
vi.mock("@/lib/financeiro/centroDeCustoServidor", () => ({ centroNaCriacao: async () => ({ ok: true, centroId: null }) }));

import { lancarDocumento, estornarLancamento } from "./lancar";
import { travasDaEdicao } from "@/lib/financeiro/edicao";
import { podeCancelarManual } from "@/lib/financeiro/manual";

const dec = (v: string) => ({ toString: () => v });

/** NF-e de compra: a Zahra vende, a BLD (a empresa do escritório) compra. */
function nota(over: Record<string, unknown> = {}) {
  return {
    id: "doc1",
    companyId: "c1",
    company: { id: "c1", kind: "PJ", cnpj: "17122471000175", cpf: null },
    type: "NFE",
    number: "123",
    series: "1",
    issuerName: "ZAHRA",
    issuerDocument: "39952818000140",
    recipientName: "BLD",
    recipientDocument: "17122471000175",
    amount: dec("1000.00"),
    netAmount: null,
    retentionsByTax: null,
    installments: null,
    issuedAt: new Date("2026-09-01T13:30:00Z"),
    competence: "2026-09",
    situation: "AUTORIZADA",
    destination: "PENDENTE",
    removedAtOrigin: false,
    financeEntries: [],
    ...over,
  };
}

const tresDuplicatas = [
  { numero: "002", vencimento: "2026-11-01", valor: "333.33" },
  { numero: "001", vencimento: "2026-10-01", valor: "333.34" },
  { numero: "003", vencimento: "2026-12-01", valor: "333.33" },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation(async (fn: (t: typeof m.tx) => unknown) => fn(m.tx));
  m.db.financeCounterparty.findFirst.mockResolvedValue({ id: "zahra", defaultCategoryId: "compras", defaultCostCenterId: null });
  m.db.financeCategory.findFirst.mockResolvedValue({ id: "compras" });
  m.tx.financeEntry.create.mockResolvedValue({ id: "e1", amount: dec("333.34") });
  m.statusInicial.mockReturnValue("NAO_REQUER");
});

describe("lancarDocumento — duplicatas da nota", () => {
  it("três duplicatas que fecham: três parcelas, cada uma no vencimento e no valor da sua, competência da compra", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    const r = await lancarDocumento("doc1", { vencimento: "2027-01-31" });
    expect(r).toEqual({ ok: true, entryId: "e1" });

    const primeira = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(primeira).toMatchObject({
      amount: "333.34",
      competence: "2026-09",
      fiscalDocumentId: "doc1",
      fiscalDocumentInstallment: 1,
      recurrenceIndex: 1,
      recurrenceTotal: 3,
      status: "PROVISORIO",
    });
    // O vencimento do formulário não vale na parcelada: o da 1ª duplicata.
    expect(primeira.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");

    const outras = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(outras.map((o: { amount: string }) => o.amount)).toEqual(["333.33", "333.33"]);
    expect(outras.map((o: { dueDate: Date }) => o.dueDate.toISOString().slice(0, 10))).toEqual(["2026-11-01", "2026-12-01"]);
    expect(outras.map((o: { recurrenceIndex: number }) => o.recurrenceIndex)).toEqual([2, 3]);
    for (const o of outras) {
      expect(o).toMatchObject({ competence: "2026-09", recurrenceId: primeira.recurrenceId, recurrenceTotal: 3, documentNumber: "123/1" });
      // 1:N (23/10): cada parcela é ligada à nota, na sua posição.
      expect(o.fiscalDocumentId).toBe("doc1");
      expect(o.issueDate).toEqual(primeira.issueDate);
    }
    expect(outras.map((o: { fiscalDocumentInstallment: number }) => o.fiscalDocumentInstallment)).toEqual([2, 3]);
    expect(m.tx.financeRecurrence.create.mock.calls[0]![0].data).toMatchObject({
      id: primeira.recurrenceId,
      endMode: "VEZES",
      dayAdjust: "MANTER",
      total: 3,
      lastIndex: 3,
      firstDueDate: "2026-10-01",
      firstCompetence: "2026-09",
    });
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas).toMatchObject({ parcelas: 3, serie: primeira.recurrenceId, total: "1000.00" });
  });

  it("com alçada: todas as parcelas entram aguardando, e cada uma avisa com o seu valor", async () => {
    m.statusInicial.mockReturnValue("AGUARDANDO");
    m.avisarAprovadores.mockResolvedValue({ enviados: 1, semSmtp: false });
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    await lancarDocumento("doc1", {});
    expect(m.registrarEnvios).toHaveBeenCalledTimes(2);
    expect(m.registrarEnvios.mock.calls[1]![1]).toHaveLength(2);
    expect(m.avisarAprovadores.mock.calls[0]![1].map((a: { amount: { toString(): string } }) => a.amount.toString())).toEqual([
      "333.34",
      "333.33",
      "333.33",
    ]);
  });

  it("duplicatas que não fecham: a conta de sempre, inteira, e o motivo na auditoria", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: [tresDuplicatas[0], tresDuplicatas[1]] }));
    await lancarDocumento("doc1", { vencimento: "2026-10-01" });
    expect(String(m.tx.financeEntry.create.mock.calls[0]![0].data.amount)).toBe("1000.00");
    expect(m.tx.financeEntry.create.mock.calls[0]![0].data.recurrenceId).toBeUndefined();
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.tx.financeRecurrence.create).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas.recusadas).toMatch(/somam/);
  });

  it("uma duplicata: uma conta, vencendo nela quando o formulário não diz", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: [{ numero: "1", vencimento: "2026-09-21", valor: "1000.00" }] }));
    await lancarDocumento("doc1", {});
    const conta = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(conta.dueDate.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(conta.recurrenceId).toBeUndefined();
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
  });

  it("sem duplicatas: o comportamento de antes — vencimento presumido, nada de série", async () => {
    m.obterDocumento.mockResolvedValue(nota());
    await lancarDocumento("doc1", {});
    const conta = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(conta.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(conta.recurrenceId).toBeUndefined();
    // A conta única é a posição 1 da nota — a mesma guarda do segundo clique.
    expect(conta).toMatchObject({ fiscalDocumentId: "doc1", fiscalDocumentInstallment: 1 });
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas).toBeUndefined();
  });

  it("já lançada: recusa antes de gravar qualquer parcela", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas, destination: "LANCADO", financeEntries: [{ id: "e1" }] }));
    const r = await lancarDocumento("doc1", {});
    expect(r).toHaveProperty("error");
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("dois cliques ao mesmo tempo: o unique barra a 1ª parcela, e as outras não nascem", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    m.tx.financeEntry.create.mockRejectedValueOnce(new Error("Unique constraint failed on fiscalDocumentId"));
    const r = await lancarDocumento("doc1", {});
    expect(r).toEqual({ error: "Este documento já virou lançamento." });
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.tx.financeRecurrence.create).not.toHaveBeenCalled();
  });
});


describe("lancarDocumento — dois cliques ao mesmo tempo, com o unique de (nota, posição)", () => {
  // Um banco de mentira que faz o que o InnoDB faz com o unique: a chave
  // (fiscalDocumentId, fiscalDocumentInstallment) inserida por uma transação
  // em curso ou já gravada barra a mesma chave na outra, e a transação que
  // falha desfaz tudo o que inseriu.
  function bancoComUnique() {
    const chaves = new Set<string>();
    const gravadas: Record<string, unknown>[] = [];
    m.db.$transaction.mockImplementation(async (fn: (t: typeof m.tx) => unknown) => {
      const minhas: string[] = [];
      const linhas: Record<string, unknown>[] = [];
      const inserir = (d: Record<string, unknown>) => {
        if (d.fiscalDocumentId) {
          const chave = `${d.fiscalDocumentId}#${d.fiscalDocumentInstallment ?? 1}`;
          if (chaves.has(chave)) throw new Error("Unique constraint failed on the constraint: `finance_entries_fiscalDocumentId_fiscalDocumentInstallment_key`");
          chaves.add(chave);
          minhas.push(chave);
        }
        linhas.push(d);
      };
      const tx = {
        ...m.tx,
        financeEntry: {
          ...m.tx.financeEntry,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            // Cede a vez: as duas transações chegam aqui "juntas".
            await Promise.resolve();
            inserir(data);
            return { id: `e${gravadas.length + linhas.length}`, amount: data.amount };
          },
          createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
            for (const d of data) inserir(d);
            return { count: data.length };
          },
        },
      };
      try {
        const r = await fn(tx as unknown as typeof m.tx);
        gravadas.push(...linhas);
        return r;
      } catch (e) {
        for (const c of minhas) chaves.delete(c);
        throw e;
      }
    });
    return { gravadas };
  }

  it("parcelada: só uma transação grava, com as três parcelas ligadas à nota; a outra não deixa parcela nenhuma", async () => {
    const { gravadas } = bancoComUnique();
    // As duas leem a nota antes de qualquer uma gravar: a checagem em aplicação passa nas duas.
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    const [a, b] = await Promise.all([lancarDocumento("doc1", {}), lancarDocumento("doc1", {})]);
    const resultados = [a, b];
    expect(resultados.filter((r) => "ok" in r)).toHaveLength(1);
    expect(resultados.filter((r) => "error" in r)).toEqual([{ error: "Este documento já virou lançamento." }]);
    expect(gravadas).toHaveLength(3);
    expect(gravadas.map((g) => g.fiscalDocumentId)).toEqual(["doc1", "doc1", "doc1"]);
    expect(gravadas.map((g) => g.fiscalDocumentInstallment)).toEqual([1, 2, 3]);
  });

  it("conta única: o segundo clique bate na posição 1, como no 1:1 de antes", async () => {
    const { gravadas } = bancoComUnique();
    m.obterDocumento.mockResolvedValue(nota());
    const resultados = await Promise.all([lancarDocumento("doc1", {}), lancarDocumento("doc1", {})]);
    expect(resultados.filter((r) => "ok" in r)).toHaveLength(1);
    expect(gravadas).toHaveLength(1);
  });

  it("o relançamento depois do estorno volta a valer: a chave saiu junto com as contas", async () => {
    const { gravadas } = bancoComUnique();
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    expect(await lancarDocumento("doc1", {})).toHaveProperty("ok");
    // Uma nota diferente não esbarra nas chaves desta.
    m.obterDocumento.mockResolvedValue(nota({ id: "doc2", installments: tresDuplicatas }));
    expect(await lancarDocumento("doc2", {})).toHaveProperty("ok");
    expect(gravadas).toHaveLength(6);
  });
});

describe("as travas da conta da nota valem para cada parcela", () => {
  async function parcelasNascidas() {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    await lancarDocumento("doc1", {});
    return [m.tx.financeEntry.create.mock.calls[0]![0].data, ...m.tx.financeEntry.createMany.mock.calls[0]![0].data] as {
      fiscalDocumentId: string;
    }[];
  }
  const base = { status: "PROVISORIO" as const, paidAt: null, closeReason: null, agreementId: null, doOmie: false, conciliada: false };

  it("emissão, número, valor e contraparte travados na edição de qualquer parcela", async () => {
    for (const p of await parcelasNascidas()) {
      const v = travasDaEdicao({ ...base, fiscalDocumentId: p.fiscalDocumentId });
      expect(v.pode).toBe(true);
      if (!v.pode) continue;
      for (const campo of ["emissao", "numeroDocumento", "valor", "contraparte"] as const) {
        expect(v.travas[campo]).toMatch(/nota fiscal/);
      }
      // O vencimento continua livre, como na conta da nota de sempre.
      expect(v.travas.vencimento).toBeUndefined();
    }
  });

  it("nenhuma parcela se cancela sozinha — o caminho é o estorno da nota", async () => {
    for (const p of await parcelasNascidas()) {
      expect(podeCancelarManual({ status: "PROVISORIO", paidAt: null, fiscalDocumentId: p.fiscalDocumentId })).toEqual({
        pode: false,
        motivo: expect.stringMatching(/estorne na ficha da nota/),
      });
    }
  });
});

describe("estornarLancamento — todas as contas da nota", () => {
  const lancada = () => nota({ destination: "LANCADO", financeEntries: [{ id: "e1" }] });
  const conta = (id: string, i: number, over: Record<string, unknown> = {}) => ({
    id,
    status: "PROVISORIO",
    paidPrincipal: dec("0"),
    closeReason: null,
    agreementId: null,
    recurrenceId: "s1",
    fiscalDocumentInstallment: i,
    ...over,
  });

  it("lê as contas pelo vínculo com a nota e leva as parcelas e a série juntas", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1), conta("e2", 2), conta("e3", 3)]);
    m.tx.financeEntry.deleteMany.mockResolvedValue({ count: 3 });
    expect(await estornarLancamento("doc1")).toEqual({ ok: true });
    expect(m.db.financeEntry.findMany.mock.calls[0]![0].where).toEqual({ tenantId: "t1", fiscalDocumentId: "doc1" });
    expect(m.cancelarContasDosImpostos.mock.calls[0]![2]).toEqual(["e1", "e2", "e3"]);
    expect(m.tx.financeEntry.deleteMany.mock.calls[0]![0].where).toMatchObject({
      id: { in: ["e1", "e2", "e3"] },
      fiscalDocumentId: "doc1",
      paidPrincipal: 0,
      agreementId: null,
      payments: { none: {} },
    });
    expect(m.tx.financeRecurrence.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["s1"] }, tenantId: "t1" } });
    expect(m.tx.fiscalDocument.update).toHaveBeenCalledWith({ where: { id: "doc1" }, data: { destination: "PENDENTE" } });
    expect(m.logAudit.mock.calls[0]![0].metadata).toEqual({ fiscalDocumentId: "doc1", parcelas: 3, serie: "s1" });
  });

  it("uma parcela com baixa barra o estorno inteiro — nada é apagado", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1), conta("e2", 2, { paidPrincipal: dec("100.00") }), conta("e3", 3)]);
    const r = await estornarLancamento("doc1");
    expect(r).toEqual({ error: expect.stringMatching(/parcela 2 desta nota já tem baixa/) });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("a 1ª parcela paga ou renegociada também barra", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1, { status: "PAGO" }), conta("e2", 2)]);
    expect(await estornarLancamento("doc1")).toEqual({ error: expect.stringMatching(/parcela 1 desta nota já foi paga/) });
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1), conta("e2", 2, { agreementId: "ac1" })]);
    expect(await estornarLancamento("doc1")).toEqual({ error: expect.stringMatching(/parcela 2 .*acordo/) });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("a baixa que chegou entre a leitura e o estorno: a transação desfaz tudo", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1), conta("e2", 2), conta("e3", 3)]);
    m.tx.financeEntry.deleteMany.mockResolvedValue({ count: 2 });
    const r = await estornarLancamento("doc1");
    expect(r).toEqual({ error: expect.stringMatching(/acabou de mudar/) });
    expect(m.tx.fiscalDocument.update).not.toHaveBeenCalled();
  });

  it("conta única (inclusive a ligada 1:1 de antes da migration): o estorno de sempre, com as frases de sempre", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1, { recurrenceId: null })]);
    m.tx.financeEntry.deleteMany.mockResolvedValue({ count: 1 });
    expect(await estornarLancamento("doc1")).toEqual({ ok: true });
    expect(m.tx.financeRecurrence.deleteMany).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata).toEqual({ fiscalDocumentId: "doc1" });

    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1, { recurrenceId: null, status: "PAGO" })]);
    expect(await estornarLancamento("doc1")).toEqual({ error: expect.stringMatching(/^O lançamento já foi pago/) });
    m.db.financeEntry.findMany.mockResolvedValue([conta("e1", 1, { recurrenceId: null, closeReason: "PERDA" })]);
    expect(await estornarLancamento("doc1")).toEqual({ error: expect.stringMatching(/perda/) });
  });

  it("nota sem conta: nada a estornar", async () => {
    m.obterDocumento.mockResolvedValue(nota());
    m.db.financeEntry.findMany.mockResolvedValue([]);
    expect(await estornarLancamento("doc1")).toEqual({ error: "Este documento não tem lançamento." });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });
});

describe("lancarDocumento — conta a receber da nota de venda (23/10): a mesma regra da compra", () => {
  /** NF-e de venda: a BLD (a empresa do escritório) emite, a Zahra compra. */
  const venda = (over: Record<string, unknown> = {}) =>
    nota({
      issuerName: "BLD",
      issuerDocument: "17122471000175",
      recipientName: "ZAHRA",
      recipientDocument: "39952818000140",
      ...over,
    });

  it("três duplicatas que fecham: três parcelas a receber, cada uma ligada à nota, no vencimento e no valor da sua", async () => {
    m.obterDocumento.mockResolvedValue(venda({ installments: tresDuplicatas }));
    expect(await lancarDocumento("doc1", { vencimento: "2027-01-31" })).toEqual({ ok: true, entryId: "e1" });
    // A contraparte é o cliente (o destinatário), não a própria empresa.
    expect(m.db.financeCounterparty.findFirst.mock.calls[0]![0].where.document).toBe("39952818000140");
    const primeira = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(primeira).toMatchObject({ kind: "RECEBER", amount: "333.34", fiscalDocumentId: "doc1", fiscalDocumentInstallment: 1, recurrenceTotal: 3 });
    expect(primeira.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");
    const outras = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(outras).toHaveLength(2);
    for (const o of outras) expect(o).toMatchObject({ kind: "RECEBER", fiscalDocumentId: "doc1", recurrenceId: primeira.recurrenceId });
    expect(outras.map((o: { fiscalDocumentInstallment: number }) => o.fiscalDocumentInstallment)).toEqual([2, 3]);
    expect(outras.map((o: { dueDate: Date }) => o.dueDate.toISOString().slice(0, 10))).toEqual(["2026-11-01", "2026-12-01"]);
    expect(m.tx.financeRecurrence.create).toHaveBeenCalledTimes(1);
    expect(m.logAudit.mock.calls[0]![0].metadata).toMatchObject({ kind: "RECEBER", duplicatas: { parcelas: 3 } });
  });

  it("uma duplicata: uma conta a receber, vencendo nela", async () => {
    m.obterDocumento.mockResolvedValue(venda({ installments: [{ numero: "1", vencimento: "2026-09-21", valor: "1000.00" }] }));
    await lancarDocumento("doc1", {});
    const conta = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(conta).toMatchObject({ kind: "RECEBER", fiscalDocumentInstallment: 1 });
    expect(conta.dueDate.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas).toEqual({ parcelas: 1, vencimentoDaNota: "2026-09-21" });
  });

  it("soma que não fecha: a conta a receber inteira, e o motivo na auditoria", async () => {
    m.obterDocumento.mockResolvedValue(venda({ installments: [tresDuplicatas[0], tresDuplicatas[1]] }));
    await lancarDocumento("doc1", {});
    expect(String(m.tx.financeEntry.create.mock.calls[0]![0].data.amount)).toBe("1000.00");
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas.recusadas).toMatch(/somam/);
  });

  it("nota de venda com retenção: inteira, com o motivo — e nenhuma conta de imposto (quem recolhe é o cliente)", async () => {
    m.obterDocumento.mockResolvedValue(
      venda({
        amount: dec("1000.00"),
        netAmount: dec("985.00"),
        retentionsByTax: { IRRF: "15.00" },
        installments: [
          { numero: "1", vencimento: "2026-10-01", valor: "492.50" },
          { numero: "2", vencimento: "2026-11-01", valor: "492.50" },
        ],
      })
    );
    await lancarDocumento("doc1", {});
    expect(String(m.tx.financeEntry.create.mock.calls[0]![0].data.amount)).toBe("985.00");
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.aplicarRetencoes).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas.recusadas).toMatch(/Retenção/);
  });

  it("duplicatas ilegíveis ou acima de 120: inteira, com o motivo", async () => {
    m.obterDocumento.mockResolvedValue(venda({ installments: { nao: "é lista" } }));
    await lancarDocumento("doc1", {});
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas.recusadas).toMatch(/não se leem/);
  });

  it("sem duplicatas: a conta a receber de sempre, vencimento presumido", async () => {
    m.obterDocumento.mockResolvedValue(venda());
    await lancarDocumento("doc1", {});
    const conta = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(conta.kind).toBe("RECEBER");
    expect(conta.recurrenceId).toBeUndefined();
    expect(conta.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas).toBeUndefined();
  });

  it("estorno da venda parcelada: todas as parcelas a receber saem juntas", async () => {
    m.obterDocumento.mockResolvedValue(venda({ destination: "LANCADO", financeEntries: [{ id: "e1" }] }));
    const parcela = (id: string, i: number) => ({
      id,
      status: "CONFERIDO",
      paidPrincipal: dec("0"),
      closeReason: null,
      agreementId: null,
      recurrenceId: "s1",
      fiscalDocumentInstallment: i,
    });
    m.db.financeEntry.findMany.mockResolvedValue([parcela("e1", 1), parcela("e2", 2)]);
    m.tx.financeEntry.deleteMany.mockResolvedValue({ count: 2 });
    expect(await estornarLancamento("doc1")).toEqual({ ok: true });
    expect(m.tx.financeEntry.deleteMany.mock.calls[0]![0].where.id).toEqual({ in: ["e1", "e2"] });
  });
});
