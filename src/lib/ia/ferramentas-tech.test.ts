import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  helpdeskCategory: { findMany: vi.fn() },
  sector: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
const ops = vi.hoisted(() => ({ catalogoParaTriagem: vi.fn(), robosComSituacao: vi.fn() }));
vi.mock("@/lib/ops/catalogo", () => ops);

const { FERRAMENTAS_DO_TECH, filtrarPorBusca } = await import("./ferramentas-tech");
const { AGENT_CATALOG } = await import("./catalogo");
const { AGENTES_DO_CHAT } = await import("./chat/regras");
const sistemas = FERRAMENTAS_DO_TECH.sistemas_do_ops_center!.executar!;
const categorias = FERRAMENTAS_DO_TECH.categorias_de_chamado!.executar!;
const ctx = (escopo: Record<string, string>) => ({ tenantId: "t1", userId: "u1", escopo });

const CATALOGO = [
  { ref: "robo:extratos", tipo: "robo", nome: "Robô de extratos", descricao: "Baixa os extratos bancários e renomeia", detalhe: null, responsavel: "Ana Lima", endereco: null },
  { ref: "site:s1", tipo: "site", nome: "Portal do cliente", descricao: "Onde o cliente manda documentos", detalhe: null, responsavel: null, endereco: "https://portal.exemplo.test" },
  { ref: "app:a1", tipo: "app", nome: "Gerador de SPED", descricao: "Gera o SPED fiscal", detalhe: "org/sped", responsavel: "Bruno", endereco: null },
];
const ROBO = {
  slug: "extratos", nome: "Robô de extratos", descricao: "Baixa os extratos bancários e renomeia", cliente: null, responsavel: "Ana Lima",
  ativo: true, atividade: "Sem comunicação", ultimoSinal: "2026-11-03T12:00:00.000Z", hoje: { total: 5, sucesso: 4, erro: 1, aviso: 0 },
  ultimoEvento: { status: "ERROR", quando: "2026-11-03T12:05:00.000Z", erro: "Senha do banco expirada" }, instabilidade: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  ops.catalogoParaTriagem.mockResolvedValue(CATALOGO);
  ops.robosComSituacao.mockResolvedValue([ROBO]);
});

describe("o Tech em toda Ceci da equipe", () => {
  it("toda Ceci do chat tem as três ferramentas, e só ela", () => {
    const tech = ["sistemas_do_ops_center", "categorias_de_chamado", "propor_abrir_chamado"];
    for (const a of AGENT_CATALOG) {
      expect(tech.every((n) => a.ferramentas.includes(n)), a.code).toBe(AGENTES_DO_CHAT.has(a.code));
    }
  });

  it("abrir chamado é escrita sem executor: vira cartão, nunca grava no laço", () => {
    const abrir = FERRAMENTAS_DO_TECH.propor_abrir_chamado!;
    expect(abrir.def.natureza).toBe("escrita");
    expect(abrir.executar).toBeUndefined();
  });

  it("a busca pontua por palavra e devolve tudo quando vazia", () => {
    const textos = (i: (typeof CATALOGO)[number]) => [i.nome, i.descricao];
    expect(filtrarPorBusca(CATALOGO, "", textos)).toHaveLength(3);
    expect(filtrarPorBusca(CATALOGO, "extratos bancários", textos).map((i) => i.ref)).toEqual(["robo:extratos"]);
    expect(filtrarPorBusca(CATALOGO, "xyz", textos)).toEqual([]);
  });
});

describe("sistemas do Ops Center", () => {
  it("sem acesso no escopo, recusa — e não toca no banco", async () => {
    await expect(sistemas({ busca: "", tipo: "todos" }, ctx({ ops: "" }))).rejects.toThrow(/não está disponível/);
    expect(ops.catalogoParaTriagem).not.toHaveBeenCalled();
  });

  it("quem só abre chamado vê o catálogo da triagem, sem a situação dos robôs", async () => {
    const r = (await sistemas({ busca: "extratos", tipo: "todos" }, ctx({ ops: "catalogo" }))) as { itens: Record<string, unknown>[]; acesso: string };
    expect(ops.robosComSituacao).not.toHaveBeenCalled();
    expect(r.itens).toEqual([{ tipo: "robô", nome: "Robô de extratos", oQueFaz: "Baixa os extratos bancários e renomeia", responsavel: "Ana Lima" }]);
    expect(r.acesso).toMatch(/situação dos robôs/);
  });

  it("quem vê o Ops Center recebe a situação, o último erro e o link do robô", async () => {
    const r = (await sistemas({ busca: "", tipo: "todos" }, ctx({ ops: "completo" }))) as { itens: Record<string, unknown>[]; link: string };
    expect(r.itens[0]).toMatchObject({
      nome: "Robô de extratos",
      situacao: "sem comunicação",
      hoje: "5 arquivos — 4 com sucesso, 1 com erro, 0 com aviso",
      ultimoArquivo: expect.stringMatching(/^erro em 03\/11\/2026.*Senha do banco expirada$/),
      link: "[Ver Robô de extratos no Orquestrador](/ops?watcher=extratos)",
    });
    expect(r.itens.map((i) => i.nome)).toEqual(["Robô de extratos", "Portal do cliente", "Gerador de SPED"]);
    expect(r.link).toBe("[Abrir o Orquestrador](/ops)");
  });

  it("o tipo filtra e aponta a aba certa", async () => {
    const r = (await sistemas({ busca: "", tipo: "app" }, ctx({ ops: "completo" }))) as { itens: Record<string, unknown>[]; link: string };
    expect(ops.robosComSituacao).not.toHaveBeenCalled();
    expect(r.itens).toEqual([{ tipo: "app", nome: "Gerador de SPED", oQueFaz: "Gera o SPED fiscal", responsavel: "Bruno", repositorio: "org/sped" }]);
    expect(r.link).toBe("[Abrir o Orquestrador](/ops?view=apps)");
  });
});

describe("categorias de chamado", () => {
  const linhas = [
    { id: "g-dev", name: "Desenvolvimento", parentId: null, active: true },
    { id: "c-bug", name: "Bug | Correção", parentId: "g-dev", active: true, formSchema: [{ key: "tela", label: "Tela", type: "text", required: true }] },
    { id: "c-velha", name: "Antiga", parentId: "g-dev", active: false },
    { id: "c-anexo", name: "Novo Dashboard | BI", parentId: "g-dev", active: true, requiredAttachments: [{ key: "modelo", label: "Modelo do painel", required: true }] },
    { id: "c-classificar", name: "A classificar", parentId: null, active: true },
  ];

  it("sem permissão de abrir, recusa — e não toca no banco", async () => {
    await expect(categorias({}, ctx({ chamado: "" }))).rejects.toThrow(/não pode abrir chamados/);
    expect(prisma.helpdeskCategory.findMany).not.toHaveBeenCalled();
  });

  it("só as folhas ativas, com o caminho, os campos e o anexo; setores só os do escopo", async () => {
    prisma.helpdeskCategory.findMany.mockResolvedValue(linhas);
    prisma.sector.findMany.mockResolvedValue([{ code: "bpo", label: "BPO" }, { code: "dp", label: "DP" }]);
    const r = (await categorias({}, ctx({ chamado: "1", setoresDoChamado: "bpo,dp", setorAtivo: "dp" }))) as {
      categorias: Record<string, unknown>[];
      setorSugerido: string;
      link: string;
    };
    expect(prisma.sector.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", code: { in: ["bpo", "dp"] } });
    expect(r.categorias).toEqual([
      { categoriaId: "c-bug", caminho: "Desenvolvimento › Bug | Correção", campos: [{ chave: "tela", nome: "Tela", tipo: "text", obrigatorio: true }] },
      { categoriaId: "c-anexo", caminho: "Desenvolvimento › Novo Dashboard | BI", anexoObrigatorio: ["Modelo do painel"] },
    ]);
    expect(r.setorSugerido).toBe("dp");
    expect(r.link).toBe("[Abrir pela tela Novo chamado](/chamados/novo)");
  });
});
