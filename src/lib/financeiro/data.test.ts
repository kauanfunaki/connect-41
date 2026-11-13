import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa (08/10): a lista de contas da equipe parava em mil linhas sem
// `orderBy`, e o recorte e os totais saíam dessas mil — acima disso, contas
// sumiam da lista e do topo sem aviso. Agora o recorte vai para o banco, a
// ordem é estável, os totais e as contagens não têm teto, e a lista diz quando
// parou.
const findMany = vi.fn();
const count = vi.fn();
const aggregate = vi.fn();
// A baixa mais antiga, para o "pago desde" (lote C, 19/10).
const aggregateDasBaixas = vi.fn();
// Os funis das colunas (13/11/2026): os valores saem de um `groupBy` e os nomes, dos cadastros.
const groupBy = vi.fn();
const contrapartes = vi.fn();
const categorias = vi.fn();
const centros = vi.fn();
const projetos = vi.fn();
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    financeEntry: { findMany, count, aggregate, groupBy },
    financeEntryPayment: { aggregate: aggregateDasBaixas },
    financeCounterparty: { findMany: contrapartes },
    financeCategory: { findMany: categorias },
    costCenter: { findMany: centros },
    financeProject: { findMany: projetos },
  }),
}));

const { listarContas, listarPaginaDeContas, opcoesDoFunil, whereDoRecorte, LIMITE_DE_CONTAS } = await import("./data");

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
    _count: { allocations: 0 },
    retentions: [],
    costCenterId: null,
    costCenter: null,
    project: null,
    documentNumber: null,
    issueDate: null,
    paidPrincipal: decimal("0"),
  };
}

/** Os quatro `aggregate` de `totaisDoEscopo`: pagas (o quitado), vencidas, de hoje, a vencer (valor e quitado). */
function somasDoBanco(pago: string, vencido: string, hoje: string, aVencer: string) {
  const zero = decimal("0");
  aggregate
    .mockResolvedValueOnce({ _sum: { paidPrincipal: decimal(pago) } })
    .mockResolvedValueOnce({ _sum: { amount: decimal(vencido), paidPrincipal: zero } })
    .mockResolvedValueOnce({ _sum: { amount: decimal(hoje), paidPrincipal: zero } })
    .mockResolvedValueOnce({ _sum: { amount: decimal(aVencer), paidPrincipal: zero } });
  aggregateDasBaixas.mockResolvedValue({ _min: { paidAt: null } });
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

// ─── A lista paginada (13/11/2026) ──────────────────────────────────────────
//
// A tela ia até mil contas por vez — perto de 4 MB de RSC na produção. Agora
// traz uma página, com a ordem no banco (para a conta não trocar de página),
// e os totais e as contagens continuam sem teto, com o recorte e os funis.

describe("listarPaginaDeContas", () => {
  const doFiltro = { tenantId: "t1", kind: "PAGAR", companyId: "c1" };

  it("num recorte, uma parte só, pela fila: a página 2 pula as 50 primeiras", async () => {
    findMany.mockResolvedValueOnce([entrada({ dueDate: "2026-09-01" }), entrada({ dueDate: "2026-09-02" })]);
    count.mockResolvedValueOnce(120).mockResolvedValueOnce(500);
    somasDoBanco("0", "9000.00", "0", "0");

    const r = await listarPaginaDeContas("t1", "PAGAR", { recorte: "vencidas", empresaId: "c1" }, AGORA, 2);

    expect(findMany).toHaveBeenCalledTimes(1);
    const consulta = findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({ ...doFiltro, ...whereDoRecorte("vencidas", "2026-10-08") });
    expect(consulta.orderBy).toEqual([{ dueDate: "asc" }, { id: "asc" }]);
    expect(consulta.skip).toBe(50);
    expect(consulta.take).toBe(50);
    // A contagem do recorte e a do filtro sem recorte (o "nada neste recorte").
    expect(count.mock.calls[0][0]).toEqual({ where: consulta.where });
    expect(count.mock.calls[1][0]).toEqual({ where: doFiltro });
    expect(r).toMatchObject({ pagina: 2, porPagina: 50, totalNoRecorte: 120, totalDePaginas: 3, totalGeral: 500 });
    expect(r.totais.vencido).toBe(900_000);
    expect(r.linhas.map((l) => l.situacao)).toEqual(["VENCIDA", "VENCIDA"]);
  });

  it("em todas, as em aberto e depois o histórico: a página atravessa a divisa sem reordenar", async () => {
    const abertas = [entrada({ dueDate: "2026-10-20" })];
    const historico = [entrada({ dueDate: "2026-10-05", status: "PAGO", paidAt: new Date("2026-10-05T15:00:00Z") })];
    findMany.mockResolvedValueOnce(abertas).mockResolvedValueOnce(historico);
    // 70 em aberto e 200 no histórico.
    count.mockResolvedValueOnce(70).mockResolvedValueOnce(200);
    somasDoBanco("100.00", "0", "0", "100.00");

    const r = await listarPaginaDeContas("t1", "PAGAR", { recorte: "todas", empresaId: "c1" }, AGORA, 2);

    // Sem funil, as duas partes já são o filtro inteiro: nenhuma contagem a mais.
    expect(count).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(2);
    const [fila, hist] = findMany.mock.calls.map((c) => c[0]);
    expect(fila.where).toEqual({ ...doFiltro, ...whereDoRecorte("abertas", "2026-10-08") });
    expect(fila).toMatchObject({ skip: 50, take: 20, orderBy: [{ dueDate: "asc" }, { id: "asc" }] });
    expect(hist.where).toEqual({ ...doFiltro, OR: [{ status: { in: ["CANCELADO", "PAGO"] } }, { paidAt: { not: null } }] });
    expect(hist).toMatchObject({ skip: 0, take: 30, orderBy: [{ dueDate: "desc" }, { id: "desc" }] });
    expect(r.linhas.map((l) => l.situacao)).toEqual(["A_VENCER", "PAGA"]);
    expect(r).toMatchObject({ totalNoRecorte: 270, totalGeral: 270, totalDePaginas: 6 });
  });

  it("os funis entram na lista, na contagem do recorte e nos totais — e não na contagem geral", async () => {
    findMany.mockResolvedValueOnce([entrada({ dueDate: "2026-10-20" })]);
    // Uma em aberto, nenhuma no histórico, 300 na empresa sem os funis.
    count.mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(300);
    somasDoBanco("0", "0", "0", "100.00");

    const funis = { contraparte: ["f1"], categoria: [""] };
    const r = await listarPaginaDeContas("t1", "PAGAR", { recorte: "todas", empresaId: "c1", funis }, AGORA, 1);

    const AND = [{ counterpartyId: { in: ["f1"] } }, { categoryId: null }];
    expect(findMany.mock.calls[0][0].where).toEqual({ ...doFiltro, AND, ...whereDoRecorte("abertas", "2026-10-08") });
    // Com funil, a contagem geral vem à parte, sem ele: é ela que diz "a empresa não tem conta".
    expect(count.mock.calls[2][0]).toEqual({ where: doFiltro });
    for (const [chamada] of aggregate.mock.calls) expect(chamada.where.AND).toEqual(AND);
    expect(aggregateDasBaixas.mock.calls[0][0].where.entry.AND).toEqual(AND);
    expect(r).toMatchObject({ totalNoRecorte: 1, totalGeral: 300 });
  });

  it("página além do fim não busca linha: a tela leva para a última", async () => {
    count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
    somasDoBanco("0", "0", "0", "100.00");

    const r = await listarPaginaDeContas("t1", "RECEBER", { recorte: "abertas" }, AGORA, 5);

    expect(findMany).not.toHaveBeenCalled();
    expect(r).toMatchObject({ linhas: [], pagina: 5, totalDePaginas: 1, totalNoRecorte: 10 });
  });
});

describe("opcoesDoFunil", () => {
  const filtro = { recorte: "abertas" as const, empresaId: "c1", funis: { contraparte: ["f1"], categoria: ["c9"] } };

  it("fornecedor: um groupBy no recorte, em cascata — sem o funil da própria coluna, com o das outras", async () => {
    groupBy.mockResolvedValueOnce([
      { counterpartyId: "f1", _count: { _all: 3 } },
      { counterpartyId: "f2", _count: { _all: 1 } },
      { counterpartyId: "f3", _count: { _all: 2 } },
    ]);
    contrapartes.mockResolvedValueOnce([
      { id: "f1", name: "Alfa", company: { name: "Matriz", displayName: null } },
      { id: "f2", name: "Beta", company: { name: "Matriz", displayName: null } },
      { id: "f3", name: "Alfa", company: { name: "Filial", displayName: null } },
    ]);

    const opcoes = await opcoesDoFunil("t1", "PAGAR", filtro, "contraparte", AGORA);

    const consulta = groupBy.mock.calls[0][0];
    expect(consulta.by).toEqual(["counterpartyId"]);
    expect(consulta.where).toEqual({
      tenantId: "t1",
      kind: "PAGAR",
      companyId: "c1",
      AND: [{ categoryId: { in: ["c9"] } }],
      ...whereDoRecorte("abertas", "2026-10-08"),
    });
    expect(contrapartes.mock.calls[0][0].where).toEqual({ tenantId: "t1", id: { in: ["f1", "f2", "f3"] } });
    // O mesmo nome em duas empresas diz de qual é cada um.
    expect(opcoes).toEqual([
      { valor: "f3", rotulo: "Alfa · Filial", n: 2 },
      { valor: "f1", rotulo: "Alfa · Matriz", n: 3 },
      { valor: "f2", rotulo: "Beta", n: 1 },
    ]);
  });

  it("categoria: o nome do cadastro, e o vazio no fim, pelo nome", async () => {
    groupBy.mockResolvedValueOnce([
      { categoryId: null, _count: { _all: 4 } },
      { categoryId: "c2", _count: { _all: 1 } },
      { categoryId: "c1", _count: { _all: 2 } },
    ]);
    categorias.mockResolvedValueOnce([
      { id: "c1", name: "Aluguel" },
      { id: "c2", name: "Energia" },
    ]);

    const opcoes = await opcoesDoFunil("t1", "PAGAR", filtro, "categoria", AGORA);

    expect(groupBy.mock.calls[0][0].where.AND).toEqual([{ counterpartyId: { in: ["f1"] } }]);
    expect(categorias.mock.calls[0][0].where).toEqual({ tenantId: "t1", id: { in: ["c2", "c1"] } });
    expect(opcoes).toEqual([
      { valor: "c1", rotulo: "Aluguel", n: 2 },
      { valor: "c2", rotulo: "Energia", n: 1 },
      { valor: "", rotulo: "(sem categoria)", n: 4 },
    ]);
  });

  it("vencimento: os instantes do mesmo dia em São Paulo somam, do mais recente para o mais antigo", async () => {
    groupBy.mockResolvedValueOnce([
      { dueDate: new Date("2026-10-01T03:00:00Z"), _count: { _all: 1 } },
      { dueDate: new Date("2026-10-02T02:59:00Z"), _count: { _all: 2 } },
      { dueDate: new Date("2026-10-20T15:00:00Z"), _count: { _all: 1 } },
    ]);

    const opcoes = await opcoesDoFunil("t1", "PAGAR", filtro, "vencimento", AGORA);

    expect(opcoes).toEqual([
      { valor: "2026-10-20", rotulo: "20/10/2026", n: 1 },
      { valor: "2026-10-01", rotulo: "01/10/2026", n: 3 },
    ]);
  });

  it("situação: uma contagem por situação, só as que têm conta", async () => {
    count
      .mockResolvedValueOnce(2) // vencida
      .mockResolvedValueOnce(0) // hoje
      .mockResolvedValueOnce(5) // a vencer
      .mockResolvedValue(0);

    const opcoes = await opcoesDoFunil("t1", "PAGAR", { ...filtro, recorte: "todas" }, "situacao", AGORA);

    expect(count).toHaveBeenCalledTimes(7);
    expect(count.mock.calls[0][0].where.AND[1]).toEqual({ paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] }, dueDate: { lt: HOJE } });
    expect(opcoes).toEqual([
      { valor: "vencida", rotulo: "Vencida", n: 2 },
      { valor: "avencer", rotulo: "A vencer", n: 5 },
    ]);
  });
});
