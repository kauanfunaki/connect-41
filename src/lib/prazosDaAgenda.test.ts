import { beforeEach, describe, expect, it, vi } from "vitest";

// Quem vê cada fonte de prazo da Agenda, e o que se busca (10/11/2026): as
// fontes novas seguem a regra da própria tela — as guias, o acesso de Guias do
// mês; as obrigações, o escopo do quadro da atividade — e fonte desligada nem
// chega ao banco.

const m = vi.hoisted(() => ({
  paineis: new Map<string, { setor: string; modulos: Set<string> }>(),
  autorizacoes: null as unknown,
  setoresDasGuias: ["fiscal"] as string[] | null,
  tech: false,
  modelo: null as { id: string } | null,
  obrigacoes: [] as unknown[],
  guias: [] as unknown[],
  chamadas: {} as Record<string, unknown[]>,
}));

function registra(nome: string, resposta: () => unknown) {
  return async (args: unknown) => {
    (m.chamadas[nome] ??= []).push(args);
    return resposta();
  };
}

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    modeloDeObrigacao: { findFirst: registra("modelo", () => m.modelo) },
    obrigacaoGerada: { findMany: registra("obrigacoes", () => m.obrigacoes) },
    guia: { findMany: registra("guias", () => m.guias) },
    pipelineItem: { findMany: registra("tarefas", () => []) },
    company: { findMany: registra("empresas", () => []) },
    financeEntry: { findMany: registra("contas", () => []) },
    techInternalItem: { findMany: registra("tech", () => []) },
  }),
}));
vi.mock("@/lib/home/acessoDosPaineis", () => ({ acessoDosPaineis: async () => m.paineis }));
vi.mock("@/lib/autorizacoes/servidor", () => ({
  acessoAsAutorizacoes: async () => m.autorizacoes,
  setorDasAutorizacoes: async () => "fiscal",
}));
vi.mock("@/lib/modules", () => ({
  setoresDoModulo: async (_t: string, modulo: string) => (modulo === "fiscal_autorizacoes" ? m.setoresDasGuias : ["tech"]),
  isModuleEnabled: async () => true,
  setorDoModulo: async () => null,
  getTenantModuleStates: async () => [],
}));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: async () => m.tech }));
vi.mock("@/lib/auth/scope", () => ({
  scopedPipelineWhere: () => ({ tenantId: "t1", sectorCode: { in: ["fiscal"] } }),
  scopedVagaWhere: () => ({ tenantId: "t1" }),
}));
vi.mock("@/lib/feriados", () => ({ feriadosDoEscritorio: async () => new Map<string, string>() }));
vi.mock("@/lib/certificados/servidor", () => ({ listarCertificados: async () => [] }));
vi.mock("@/lib/financeiro/pendencias/setor", () => ({ soDoSetorPadrao: () => null, whereDoRecorteDeSetor: () => ({}) }));

const { acessoAsFontes, prazosDoPeriodo } = await import("./prazosDaAgenda");

type Ctx = Parameters<typeof prazosDoPeriodo>[0];
const ctx = (extra: Partial<Ctx> = {}) => ({ tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["fiscal"], activeSector: null, ...extra }) as Ctx;

beforeEach(() => {
  m.paineis = new Map();
  m.autorizacoes = null;
  m.setoresDasGuias = ["fiscal"];
  m.tech = false;
  m.modelo = null;
  m.obrigacoes = [];
  m.guias = [];
  m.chamadas = {};
});

describe("quem vê cada fonte", () => {
  it("sem módulo nenhum: só as atividades dos Quadros", async () => {
    expect((await acessoAsFontes(ctx())).fontes).toEqual(["tarefas"]);
  });

  it("obrigações só no escritório que gera obrigação (um modelo ativo basta)", async () => {
    m.modelo = { id: "m1" };
    expect((await acessoAsFontes(ctx())).fontes).toEqual(["obrigacoes", "tarefas"]);
    expect(m.chamadas.modelo?.[0]).toMatchObject({ where: { tenantId: "t1", active: true } });
  });

  it("guias pela regra de Guias do mês, e com setor ativo só se a tela é dele", async () => {
    m.autorizacoes = { tenantId: "t1" };
    expect((await acessoAsFontes(ctx())).fontes).toContain("guias");
    expect((await acessoAsFontes(ctx({ activeSector: "bpo" }))).fontes).not.toContain("guias");
    m.autorizacoes = null;
    expect((await acessoAsFontes(ctx())).fontes).not.toContain("guias");
  });

  it("as fontes dos painéis seguem o acesso dos painéis da Home", async () => {
    m.paineis = new Map([
      ["painel-dp", { setor: "dprh", modulos: new Set(["dp_colaboradores"]) }],
      ["painel-pendencias", { setor: "bpo", modulos: new Set(["bpo_aprovacoes"]) }],
    ]);
    const { fontes } = await acessoAsFontes(ctx());
    expect(fontes).toContain("dp");
    // O painel de pendências por causa das aprovações não traz as pendências.
    expect(fontes).not.toContain("pendencias");
  });
});

describe("o que se busca", () => {
  it("fonte desligada não chega ao banco", async () => {
    m.modelo = { id: "m1" };
    m.autorizacoes = { tenantId: "t1" };
    await prazosDoPeriodo(ctx(), "2026-11-10", "2026-12-10", { fontes: ["tarefas"], hoje: "2026-11-10" });
    expect(m.chamadas.obrigacoes).toBeUndefined();
    expect(m.chamadas.guias).toBeUndefined();
    expect(m.chamadas.tarefas).toHaveLength(1);
  });

  it("fonte ligada que a pessoa não alcança também não", async () => {
    await prazosDoPeriodo(ctx(), "2026-11-10", "2026-12-10", { fontes: ["guias", "obrigacoes"], hoje: "2026-11-10" });
    expect(m.chamadas.guias).toBeUndefined();
    expect(m.chamadas.obrigacoes).toBeUndefined();
    expect(m.chamadas.tarefas).toBeUndefined();
  });

  it("obrigações: pelo período da data legal, só com a atividade aberta num quadro que a pessoa vê", async () => {
    m.modelo = { id: "m1" };
    m.obrigacoes = [
      {
        id: "o1",
        dataLegal: "2026-11-12",
        prazoInterno: "2026-11-09",
        modelo: { nome: "DCTFWeb", sectorCode: "fiscal" },
        company: { name: "Padaria Exemplo Ltda", displayName: null },
        pipelineItem: { id: "i1", pipelineId: "p1" },
      },
    ];
    const prazos = await prazosDoPeriodo(ctx(), "2026-11-10", "2026-12-10", { fontes: ["obrigacoes"], hoje: "2026-11-10" });
    expect(m.chamadas.obrigacoes?.[0]).toMatchObject({
      where: {
        tenantId: "t1",
        dataLegal: { gte: "2026-11-10", lte: "2026-12-10" },
        pipelineItem: {
          is: { pipeline: { tenantId: "t1", sectorCode: { in: ["fiscal"] }, active: true }, stage: { isTerminal: false, type: { not: "DONE" } } },
        },
      },
    });
    expect(prazos).toEqual([
      expect.objectContaining({ tipo: "obrigacao", fonte: "obrigacoes", dia: "2026-11-12", titulo: "DCTFWeb", riscoDeMulta: true, href: "/kanban/p1/itens/i1" }),
    ]);
  });

  it("guias: as não pagas do período, pelo vencimento ou, sem ele, pelo válido até", async () => {
    m.autorizacoes = { tenantId: "t1" };
    m.guias = [
      {
        id: "g1",
        descricao: "DAS do Simples Nacional · 10/2026",
        vencimento: "2026-11-20",
        validoAte: null,
        valor: null,
        company: { name: "Estúdio Exemplo Ltda", displayName: null },
      },
    ];
    const prazos = await prazosDoPeriodo(ctx(), "2026-11-10", "2026-12-10", { fontes: ["guias"], hoje: "2026-11-10" });
    expect(m.chamadas.guias?.[0]).toMatchObject({
      where: {
        tenantId: "t1",
        pagaEm: null,
        OR: [{ vencimento: { gte: "2026-11-10", lte: "2026-12-10" } }, { vencimento: null, validoAte: { gte: "2026-11-10", lte: "2026-12-10" } }],
      },
    });
    expect(prazos).toEqual([expect.objectContaining({ tipo: "guia", fonte: "guias", dia: "2026-11-20", setor: "fiscal" })]);
  });
});
