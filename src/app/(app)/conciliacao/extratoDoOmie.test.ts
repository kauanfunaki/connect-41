import { beforeEach, describe, expect, it, vi } from "vitest";

// "Trazer do Omie" (lote 4, 28/10/2026): o espelho do extrato só entra na
// conta ligada a uma conta corrente do Omie, de empresa que ainda não virou,
// e nunca por cima de um OFX do mesmo mês. Quando entra, grava pelo mesmo
// caminho do OFX (repetição pelo FITID, conciliação pelo Omie).

const m = vi.hoisted(() => ({
  conta: null as unknown,
  comOfx: 0,
  existentes: [] as { fitId: string }[],
  createMany: vi.fn(),
  importCreate: vi.fn(),
  extrato: vi.fn(),
  conciliar: vi.fn(),
  logAudit: vi.fn(),
}));

const db = {
  bankAccount: { findFirst: async () => m.conta },
  bankStatementImport: { count: async () => m.comOfx, create: m.importCreate },
  bankTransaction: { findMany: async () => m.existentes, createMany: m.createMany },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
};

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }), canActOnSector: () => true }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => ["bpo"] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => null, lerEmpresaEmFoco: async () => null }));
vi.mock("@/lib/integracoes/omie/extratoServidor", () => ({ extratoDoOmie: m.extrato }));
vi.mock("@/lib/financeiro/conciliacao/omieServidor", () => ({ conciliarContaPeloOmie: m.conciliar }));
vi.mock("@/lib/financeiro/conciliacao/regrasServidor", () => ({ lancarPelasRegrasNaImportacao: async () => ({ lancadas: 0, recusas: [] }) }));

const { importarExtratoDoOmie } = await import("./actions");

const CONTA = { id: "ba1", companyId: "c1", active: true, type: "CORRENTE", omieAccountId: "123456", company: { omieCutoverAt: null } };
const linha = (fitId: string, centavos: number) => ({ fitId, fitIdGerado: false, tipo: "DEBIT", dataKey: "2026-10-15", centavos, memo: null, nome: null, cheque: null });
const LEITURA = {
  ok: true,
  leitura: {
    extrato: { bancoId: "341", agencia: null, contaId: "1", tipoDaConta: null, inicioKey: "2026-10-01", fimKey: "2026-10-31", saldo: null, transacoes: [linha("omie:1", -1000), linha("omie:2", 500)], zeradas: 0, charset: "utf-8" },
    fora: { naoConciliados: 2, semNatureza: 0, semData: 0, semCodigo: 0 },
  },
};

beforeEach(() => {
  m.conta = CONTA;
  m.comOfx = 0;
  m.existentes = [];
  m.createMany.mockReset();
  m.importCreate.mockReset().mockResolvedValue({ id: "imp1" });
  m.extrato.mockReset().mockResolvedValue(LEITURA);
  m.conciliar.mockReset().mockResolvedValue(2);
  m.logAudit.mockReset();
});

describe("trazer o extrato do Omie", () => {
  it("grava as linhas conciliadas no Omie e concilia pelo Omie", async () => {
    const r = await importarExtratoDoOmie("ba1", "2026-10");
    expect(r).toMatchObject({ ok: true, resumo: { lidas: 2, novas: 2, conciliadasPeloOmie: 2 } });
    expect(m.extrato).toHaveBeenCalledWith("t1", "c1", "123456", "2026-10");
    expect(m.importCreate.mock.calls[0]![0].data).toMatchObject({ fileName: "Omie · extrato 2026-10", transactionsNew: 2 });
    expect(m.createMany.mock.calls[0]![0].data.map((t: { fitId: string }) => t.fitId)).toEqual(["omie:1", "omie:2"]);
    expect((r as { resumo: { avisos: string[] } }).resumo.avisos[0]).toContain("2 lançamentos ainda não conciliados no Omie");
  });

  it("reimportar o mesmo mês não duplica", async () => {
    m.existentes = [{ fitId: "omie:1" }];
    const r = await importarExtratoDoOmie("ba1", "2026-10");
    expect(r).toMatchObject({ ok: true, resumo: { novas: 1, repetidas: 1 } });
  });

  it("conta sem ligação com o Omie, ou empresa que já virou, não traz nada", async () => {
    m.conta = { ...CONTA, omieAccountId: null };
    expect(await importarExtratoDoOmie("ba1", "2026-10")).toMatchObject({ error: expect.stringContaining("não está ligada") });
    m.conta = { ...CONTA, company: { omieCutoverAt: new Date() } };
    expect(await importarExtratoDoOmie("ba1", "2026-10")).toMatchObject({ error: expect.stringContaining("já virou") });
    expect(m.extrato).not.toHaveBeenCalled();
  });

  it("conta com OFX no mesmo mês é recusada, sem gravar", async () => {
    m.comOfx = 1;
    expect(await importarExtratoDoOmie("ba1", "2026-10")).toMatchObject({ error: expect.stringContaining("OFX") });
    expect(m.importCreate).not.toHaveBeenCalled();
  });

  it("mês inválido e erro do Omie viram mensagem", async () => {
    expect(await importarExtratoDoOmie("ba1", "2026-13")).toMatchObject({ error: "Escolha o mês do extrato." });
    m.extrato.mockResolvedValue({ ok: false, erro: "Não deu para ler o extrato no Omie: chave inválida" });
    expect(await importarExtratoDoOmie("ba1", "2026-10")).toEqual({ error: "Não deu para ler o extrato no Omie: chave inválida" });
  });

  it("nada conciliado no Omie: diz o que ficou de fora", async () => {
    m.extrato.mockResolvedValue({ ok: true, leitura: { ...LEITURA.leitura, extrato: { ...LEITURA.leitura.extrato, transacoes: [] } } });
    expect(await importarExtratoDoOmie("ba1", "2026-10")).toMatchObject({ error: expect.stringContaining("Ficaram de fora do espelho") });
    expect(m.importCreate).not.toHaveBeenCalled();
  });
});
