import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { AuthContext } from "@/lib/auth/context";

// A tela de Contas a pagar e a receber paginada (13/11/2026), com perfis de
// um setor — quem opera o BPO, não a conta do Kauan, que é admin e vê tudo.
//
// A página roda de verdade sobre o banco simulado: o portão, a escolha da
// empresa, `listarPaginaDeContas` (skip, take e a ordem das partes), o pulo
// para a última página e o que vai para a tabela. Os componentes filhos são
// trocados por marcadores: aqui se confere o que a página passa a eles.

const m = vi.hoisted(() => ({
  ctx: null as AuthContext | null,
  setores: {} as Record<string, string[]>,
  ligados: new Set<string>(),
  companyFindMany: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  aggregate: vi.fn(),
  groupBy: vi.fn(),
  aggregateDasBaixas: vi.fn(),
  costCenterFindFirst: vi.fn(),
}));

class NaoAchou extends Error {}
class Redirecionou extends Error {
  constructor(public para: string) {
    super(para);
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NaoAchou("404");
  },
  redirect: (para: string) => {
    throw new Redirecionou(para);
  },
}));
vi.mock("@/lib/auth/context", async () => {
  const papeis = await import("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: vi.fn(async () => m.ctx) };
});
vi.mock("@/lib/modules", () => ({
  setoresDoModulo: vi.fn(async (_t: string, codigo: string) => m.setores[codigo] ?? null),
  isModuleEnabled: vi.fn(async (_t: string, codigo: string) => m.ligados.has(codigo)),
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: { findMany: m.companyFindMany },
    financeEntry: { count: m.count, findMany: m.findMany, aggregate: m.aggregate, groupBy: m.groupBy },
    financeEntryPayment: { aggregate: m.aggregateDasBaixas },
    costCenter: { findFirst: m.costCenterFindFirst },
  }),
}));
// A empresa da faixa "Trabalhando em": a Empresa Um, sem foco.
vi.mock("@/lib/empresas/ultimaEmpresa", () => ({
  escolherEmpresaDaTela: vi.fn(async () => ({
    escolha: { tipo: "empresa", companyId: "c1" },
    empresa: { id: "c1", nome: "Empresa Um" },
    noSeletor: [],
    foco: null,
    empresasDeTodas: null,
  })),
}));
vi.mock("@/lib/integracoes/omie/viradaServidor", () => ({ empresaLidaDoOmie: vi.fn(async () => false) }));
vi.mock("@/lib/financeiro/cobranca/consultas", () => ({
  MODULO_DE_COBRANCA: "bpo_cobranca",
  situacoesDeCobranca: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/financeiro/adiantamentoServidor", () => ({ saldosDeAdiantamento: vi.fn(), adiantamentosLancados: vi.fn() }));
vi.mock("@/lib/financeiro/cartaoServidor", () => ({ cartoesDaEmpresa: vi.fn() }));

// Marcadores no lugar dos componentes filhos.
vi.mock("./ContasTable", () => ({ ContasTable: function ContasTable() {} }));
vi.mock("./AcoesEmLoteDasContas", () => ({ AcoesEmLoteDasContas: function AcoesEmLoteDasContas() {} }));
vi.mock("./AnaliseDeContas", () => ({ AnaliseDeContas: function AnaliseDeContas() {} }));
vi.mock("./AdiantamentosDaEmpresa", () => ({ AdiantamentosDaEmpresa: function AdiantamentosDaEmpresa() {} }));
vi.mock("./CartoesDaEmpresa", () => ({ CartoesDaEmpresa: function CartoesDaEmpresa() {} }));
vi.mock("@/components/empresas/FiltroDaEmpresa", () => ({ FiltroDaEmpresa: function FiltroDaEmpresa() {}, EscolhaAEmpresa: function EscolhaAEmpresa() {} }));
vi.mock("@/components/shared/Pagination", () => ({ Pagination: function Pagination() {} }));
vi.mock("@/components/shared/FiltroDeColunas", () => ({ FiltrosDasColunasNaUrl: function FiltrosDasColunasNaUrl() {} }));
vi.mock("@/components/shared/BotaoDeExportar", () => ({ BotaoDeExportar: function BotaoDeExportar() {} }));

const { ContasPage } = await import("./ContasPage");
const { ContasTable } = await import("./ContasTable");
const { AcoesEmLoteDasContas } = await import("./AcoesEmLoteDasContas");
const { Pagination } = await import("@/components/shared/Pagination");
const { FiltrosDasColunasNaUrl } = await import("@/components/shared/FiltroDeColunas");
const { BotaoDeExportar } = await import("@/components/shared/BotaoDeExportar");

// 13/11/2026 às 12h em São Paulo.
const AGORA = new Date("2026-11-13T15:00:00Z");

function ctx(sectors: string[]): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role: "SECTOR_USER",
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

const decimal = (s: string) => ({ toString: () => s });
let seq = 0;
function entrada(dueDate: string, pago = false) {
  seq += 1;
  return {
    id: `e${String(seq).padStart(4, "0")}`,
    status: pago ? "PAGO" : "CONFERIDO",
    amount: decimal("100.00"),
    dueDate: new Date(`${dueDate}T12:00:00-03:00`),
    forecastDate: null,
    paidAt: pago ? new Date(`${dueDate}T15:00:00Z`) : null,
    competence: "2026-10",
    description: null,
    fiscalDocumentId: null,
    approvalStatus: "NAO_REQUER",
    closeReason: null,
    agreementId: null,
    company: { id: "c1", name: "Empresa Um", displayName: null, omieCutoverAt: null },
    omieTitleId: null,
    omieMovementId: null,
    counterparty: { name: "Fornecedor" },
    category: { name: "Aluguel" },
    _count: { allocations: 0 },
    retentions: [],
    costCenterId: null,
    costCenter: null,
    project: null,
    documentNumber: null,
    recurrenceIndex: null,
    recurrenceTotal: null,
    issueDate: null,
    paidPrincipal: decimal(pago ? "100.00" : "0"),
  };
}

/** Os elementos de um tipo na árvore que a página devolve — nos filhos e nas props. */
function achar(no: unknown, tipo: unknown): ReactElement<Record<string, unknown>>[] {
  const achados: ReactElement<Record<string, unknown>>[] = [];
  const visitar = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visitar);
    if (!n || typeof n !== "object" || !("props" in n) || !("type" in n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    if (el.type === tipo) achados.push(el);
    for (const v of Object.values(el.props ?? {})) visitar(v);
  };
  visitar(no);
  return achados;
}

async function abrir(kind: "PAGAR" | "RECEBER", params: Record<string, string | string[]>) {
  const modulo = kind === "PAGAR" ? "bpo_contas_pagar" : "bpo_contas_receber";
  return ContasPage({ kind, modulo, searchParams: Promise.resolve(params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  seq = 0;
  m.ctx = ctx(["bpo"]);
  m.setores = { bpo_contas_pagar: ["bpo"], bpo_contas_receber: ["bpo"] };
  m.ligados = new Set(["bpo_contas_pagar", "bpo_contas_receber"]);
  m.companyFindMany.mockResolvedValue([{ id: "c1", name: "Empresa Um", displayName: null, logoUrl: null, cnpj: null, parentCompanyId: null }]);
  m.aggregate.mockResolvedValue({ _sum: { amount: decimal("0"), paidPrincipal: decimal("0") } });
  m.aggregateDasBaixas.mockResolvedValue({ _min: { paidAt: null } });
  m.groupBy.mockResolvedValue([]);
  m.costCenterFindFirst.mockResolvedValue(null);
});

describe("Contas a pagar paginada, com um usuário só do BPO", () => {
  it("a página 2 de 'todas' pula a fila inteira e começa no histórico — 50 linhas, e a paginação diz 2 de 3", async () => {
    // 30 em aberto e 100 no histórico: a página 2 começa na 21ª do histórico.
    m.count.mockResolvedValueOnce(30).mockResolvedValueOnce(100);
    m.findMany.mockResolvedValueOnce(Array.from({ length: 50 }, () => entrada("2026-09-10", true)));

    const pagina = await abrir("PAGAR", { empresa: "c1", pagina: "2" });

    expect(m.findMany).toHaveBeenCalledTimes(1);
    const consulta = m.findMany.mock.calls[0][0];
    expect(consulta).toMatchObject({ skip: 20, take: 50, orderBy: [{ dueDate: "desc" }, { id: "desc" }] });
    expect(consulta.where).toMatchObject({ tenantId: "t1", kind: "PAGAR", companyId: "c1" });

    const [tabela] = achar(pagina, ContasTable);
    const linhas = tabela.props.linhas as { id: string; empresa?: string }[];
    expect(linhas).toHaveLength(50);
    // Com a empresa escolhida, o nome dela não vai em cada linha.
    expect(linhas.every((l) => l.empresa === undefined)).toBe(true);
    expect(tabela.props).toMatchObject({ empresa: "c1", filtrado: false, mostrarEmpresa: false, mostrarCentro: false });

    const [paginacao] = achar(pagina, Pagination);
    expect(paginacao.props).toMatchObject({ page: 2, totalPages: 3, total: 130, rotulo: "contas" });
    const href = paginacao.props.buildHref as (n: number) => string;
    expect(href(3)).toBe("/pagar?empresa=c1&pagina=3");
    expect(href(1)).toBe("/pagar?empresa=c1");

    // A seleção em lote diz que vale só para a página.
    const [lote] = achar(pagina, AcoesEmLoteDasContas);
    expect(lote.props).toMatchObject({ paginada: true, comCentro: false, aPagar: true });
  });

  it("o funil da URL entra na consulta, a faixa 'Filtro nas colunas' aparece e a exportação o leva", async () => {
    m.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(400);
    m.findMany.mockResolvedValueOnce([entrada("2026-11-20"), entrada("2026-11-21"), entrada("2026-11-22")]);

    const pagina = await abrir("PAGAR", { empresa: "c1", contraparte: ["f1", "f2"] });

    expect(m.findMany.mock.calls[0][0].where.AND).toEqual([{ counterpartyId: { in: ["f1", "f2"] } }]);
    expect(achar(pagina, FiltrosDasColunasNaUrl)).toHaveLength(1);
    const [exportar] = achar(pagina, BotaoDeExportar);
    expect(exportar.props.href).toBe("/pagar/exportar?empresa=c1&recorte=todas&contraparte=f1&contraparte=f2");
    // Uma página só: a barra do lote não precisa dizer "nesta página".
    expect(achar(pagina, AcoesEmLoteDasContas)[0].props.paginada).toBe(false);
  });

  it("página além do fim vai para a última, com os mesmos filtros — o '(sem categoria)' do funil inclusive", async () => {
    // Com o funil, 60 vencidas — duas páginas de 50 — e 400 contas na empresa.
    m.count.mockResolvedValueOnce(60).mockResolvedValueOnce(400);

    // `categoria=` em branco é o "(sem categoria)": perdê-lo no caminho trocaria o filtro
    // (achado no MySQL de verdade, 13/11/2026). Parâmetro em branco que não é funil sai.
    await expect(
      abrir("PAGAR", { empresa: "c1", recorte: "vencidas", categoria: ["c9", ""], competencia: "", pagina: "9" })
    ).rejects.toThrow(new Redirecionou("/pagar?empresa=c1&recorte=vencidas&categoria=c9&categoria=&pagina=2"));
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("os links de página levam o funil em branco junto", async () => {
    m.count.mockResolvedValueOnce(120).mockResolvedValueOnce(400);
    m.findMany.mockResolvedValueOnce([entrada("2026-09-01")]);

    const pagina = await abrir("PAGAR", { empresa: "c1", recorte: "vencidas", categoria: "" });

    const href = achar(pagina, Pagination)[0].props.buildHref as (n: number) => string;
    expect(href(2)).toBe("/pagar?empresa=c1&recorte=vencidas&categoria=&pagina=2");
  });

  it("usuário de outro setor: a tela não existe para ele, e nenhuma conta é lida", async () => {
    m.ctx = ctx(["dp"]);
    await expect(abrir("PAGAR", { empresa: "c1" })).rejects.toBeInstanceOf(NaoAchou);
    expect(m.count).not.toHaveBeenCalled();
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("dois setores, um deles o BPO, com outro ativo: entra e pagina igual", async () => {
    m.ctx = { ...ctx(["dp", "bpo"]), activeSector: "dp" };
    m.count.mockResolvedValueOnce(51).mockResolvedValueOnce(0);
    m.findMany.mockResolvedValueOnce([entrada("2026-12-31")]);

    const pagina = await abrir("PAGAR", { empresa: "c1", pagina: "2" });

    expect(m.findMany.mock.calls[0][0]).toMatchObject({ skip: 50, take: 1 });
    expect(achar(pagina, Pagination)[0].props).toMatchObject({ page: 2, totalPages: 2, total: 51 });
  });
});

describe("Contas a receber com o módulo movido de setor", () => {
  beforeEach(() => {
    m.setores.bpo_contas_receber = ["financeiro"];
  });

  it("quem era do BPO deixa de ver; quem é do setor novo vê a lista paginada", async () => {
    await expect(abrir("RECEBER", { empresa: "c1" })).rejects.toBeInstanceOf(NaoAchou);

    m.ctx = ctx(["financeiro"]);
    // "Todas" em a receber: em aberto e histórico.
    m.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    m.findMany.mockResolvedValueOnce([entrada("2026-11-20"), entrada("2026-11-25")]);

    const pagina = await abrir("RECEBER", { empresa: "c1" });

    // As duas que existem: o `take` é o que a parte tem, até 50.
    expect(m.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 2 });
    expect((achar(pagina, ContasTable)[0].props.linhas as unknown[]).length).toBe(2);
    expect(achar(pagina, Pagination)[0].props).toMatchObject({ page: 1, totalPages: 1, total: 2 });
  });

  it("módulo desligado: 404 também para o setor dono", async () => {
    m.ctx = ctx(["financeiro"]);
    m.ligados.delete("bpo_contas_receber");
    await expect(abrir("RECEBER", { empresa: "c1" })).rejects.toBeInstanceOf(NaoAchou);
  });
});
