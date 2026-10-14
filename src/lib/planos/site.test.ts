import { beforeEach, describe, expect, it, vi } from "vitest";

// A seção Planos do site (14/10/2026): só os planos ativos marcados "Mostrar no
// site", na ordem do site, com preço só quando o interruptor está ligado — e o
// site nunca cai por causa dela (sem as tabelas, com erro ou com o banco lento).

const m = vi.hoisted(() => ({
  noSite: vi.fn(),
  config: vi.fn(),
  planos: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    planoNoSite: { findMany: m.noSite },
    configuracaoDoConnect: { findMany: m.config },
    subscriptionPlan: { findMany: m.planos },
  }),
}));

const { lerAjustesDoSite, lerPlanosDoSite } = await import("./site");
const { montarPlanosDoSite, lerCamposDoSite, CAMPOS_DO_SITE_PADRAO, PARA_QUEM_PADRAO } = await import("./site-regras");

const semTabela = () => Object.assign(new Error("The table `planos_no_site` does not exist"), { code: "P2021" });

const plano = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  managementMode: "MANAGED" as const,
  billingType: "FLAT_MONTHLY" as const,
  basePrice: "1500.00",
  pricePerUser: null,
  setupFee: "3000.00",
  allowedModuleCodes: null,
  active: true,
  ...extra,
});

const linha = (planId: string, extra: Record<string, unknown> = {}) => ({
  planId,
  mostrarNoSite: true,
  ordem: 1,
  destacar: false,
  paraQuem: null,
  destaques: null,
  updatedAt: new Date(),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.config.mockResolvedValue([]);
});

describe("lerPlanosDoSite", () => {
  it("só os marcados, ativos, na ordem do site; sem preço por padrão", async () => {
    m.noSite.mockResolvedValue([linha("auto", { ordem: 2 }), linha("ger", { ordem: 1 }), linha("fora", { mostrarNoSite: false })]);
    m.planos.mockResolvedValue([
      plano("auto", "Autoatendimento", { managementMode: "SELF_SERVICE", billingType: "PER_USER_MONTHLY", pricePerUser: "89.90" }),
      plano("ger", "Gerenciado"),
    ]);
    const r = await lerPlanosDoSite();
    // Só os marcados vão à consulta dos planos, e só os ativos.
    expect(m.planos).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["auto", "ger"] }, active: true } }));
    expect(r?.mostrarPrecos).toBe(false);
    expect(r?.planos.map((p) => p.nome)).toEqual(["Gerenciado", "Autoatendimento"]);
    expect(r?.planos.every((p) => p.preco === null)).toBe(true);
    // Nada de valor no que vai para a página.
    expect(JSON.stringify(r)).not.toMatch(/1500|89\.9|3000/);
  });

  it("com o interruptor ligado, o preço do tipo de cobrança e a implantação", async () => {
    m.config.mockResolvedValue([{ chave: "site.mostrarPrecos", valor: "true" }]);
    m.noSite.mockResolvedValue([linha("auto")]);
    m.planos.mockResolvedValue([
      plano("auto", "Autoatendimento", { managementMode: "SELF_SERVICE", billingType: "PER_USER_MONTHLY", pricePerUser: "89.90", basePrice: "0" }),
    ]);
    const r = await lerPlanosDoSite();
    expect(r?.mostrarPrecos).toBe(true);
    expect(r?.planos[0]?.preco).toEqual({ cobranca: "PER_USER_MONTHLY", valor: 89.9, implantacao: 3000 });
  });

  it("nenhum plano marcado: sem seção, e nem consulta os planos", async () => {
    m.noSite.mockResolvedValue([linha("ger", { mostrarNoSite: false })]);
    expect(await lerPlanosDoSite()).toBeNull();
    expect(m.planos).not.toHaveBeenCalled();
  });

  it("marcado mas desativado: sem seção", async () => {
    m.noSite.mockResolvedValue([linha("ger")]);
    m.planos.mockResolvedValue([]);
    expect(await lerPlanosDoSite()).toBeNull();
  });

  it("sem as tabelas (migration que ainda não rodou): sem seção, sem lançar", async () => {
    m.noSite.mockRejectedValue(semTabela());
    m.config.mockRejectedValue(semTabela());
    expect(await lerPlanosDoSite()).toBeNull();
    expect(m.planos).not.toHaveBeenCalled();
  });

  it("banco fora do ar: sem seção, sem lançar", async () => {
    m.noSite.mockResolvedValue([linha("ger")]);
    m.planos.mockRejectedValue(new Error("Connection refused"));
    expect(await lerPlanosDoSite()).toBeNull();
  });

  it("banco lento: desiste e abre o site sem a seção", async () => {
    m.noSite.mockReturnValue(new Promise(() => {}));
    expect(await lerPlanosDoSite(20)).toBeNull();
  });
});

describe("lerAjustesDoSite", () => {
  it("lê cada plano e o interruptor; só 'true' liga", async () => {
    m.noSite.mockResolvedValue([linha("ger", { destaques: ["Um", 2, " ", "Dois", "Três", "Quatro"], paraQuem: "  " })]);
    m.config.mockResolvedValue([{ chave: "site.mostrarPrecos", valor: "sim" }]);
    const r = await lerAjustesDoSite();
    expect(r.situacao).toBe("ok");
    expect(r.mostrarPrecos).toBe(false);
    expect(r.porPlano.get("ger")).toEqual({ mostrarNoSite: true, ordem: 1, destacar: false, paraQuem: null, destaques: ["Um", "Dois", "Três"] });
    // As duas chaves numa leitura só.
    expect(m.config).toHaveBeenCalledWith({ where: { chave: { in: ["site.mostrarPrecos", "site.cartaoSobMedida"] } } });
  });

  it("sem a tabela, avisa a tela de Planos", async () => {
    m.noSite.mockRejectedValue(semTabela());
    expect(await lerAjustesDoSite()).toEqual({ porPlano: new Map(), mostrarPrecos: false, cartaoSobMedida: true, situacao: "sem-tabela" });
  });

  // O cartão "Connect sob medida" (14/10/2026) começa ligado: sem a linha da
  // chave, aparece; só "false" esconde — e o interruptor dos preços não mexe nele.
  it("o cartão sob medida: ligado sem a chave, desligado só com 'false'", async () => {
    m.noSite.mockResolvedValue([]);
    expect((await lerAjustesDoSite()).cartaoSobMedida).toBe(true);
    m.config.mockResolvedValue([{ chave: "site.cartaoSobMedida", valor: "qualquer" }]);
    expect((await lerAjustesDoSite()).cartaoSobMedida).toBe(true);
    m.config.mockResolvedValue([
      { chave: "site.cartaoSobMedida", valor: "false" },
      { chave: "site.mostrarPrecos", valor: "true" },
    ]);
    const r = await lerAjustesDoSite();
    expect(r).toMatchObject({ cartaoSobMedida: false, mostrarPrecos: true });
  });

  it("banco recusando a leitura: o cartão fica no padrão (ligado), e a seção some do mesmo jeito", async () => {
    m.noSite.mockRejectedValue(new Error("Connection refused"));
    expect(await lerAjustesDoSite()).toEqual({ porPlano: new Map(), mostrarPrecos: false, cartaoSobMedida: true, situacao: "erro" });
  });
});

describe("lerPlanosDoSite e o cartão sob medida", () => {
  it("vai com a seção, com os setores do catálogo; escondido pelo Super Admin, a seção fica só com os planos", async () => {
    m.noSite.mockResolvedValue([linha("ger")]);
    m.planos.mockResolvedValue([plano("ger", "Gerenciado")]);
    const ligado = await lerPlanosDoSite();
    expect(ligado?.sobMedida?.setores.map((s) => s.code)).toContain("bpo");
    expect(ligado?.sobMedida?.setores.every((s) => Object.keys(s).sort().join() === "code,cor,rotulo")).toBe(true);

    m.config.mockResolvedValue([{ chave: "site.cartaoSobMedida", valor: "false" }]);
    const desligado = await lerPlanosDoSite();
    expect(desligado?.planos).toHaveLength(1);
    expect(desligado?.sobMedida).toBeNull();
  });

  it("sem plano marcado, nem seção nem cartão — o cartão não aparece sozinho", async () => {
    m.noSite.mockResolvedValue([linha("ger", { mostrarNoSite: false })]);
    expect(await lerPlanosDoSite()).toBeNull();
  });
});

describe("montarPlanosDoSite", () => {
  it("sem 'para quem é', o texto do modo; empate na ordem, pelo nome; setores do plano", () => {
    const noSite = new Map([
      ["b", { ...CAMPOS_DO_SITE_PADRAO, mostrarNoSite: true }],
      ["a", { ...CAMPOS_DO_SITE_PADRAO, mostrarNoSite: true, paraQuem: "Para quem quer tudo pronto", destacar: true }],
    ]);
    const r = montarPlanosDoSite(
      [plano("b", "Beta", { allowedModuleCodes: ["recrutamento_vagas", "bpo_dre"] }), plano("a", "Alfa")],
      noSite,
      false,
    );
    expect(r?.planos.map((p) => p.nome)).toEqual(["Alfa", "Beta"]);
    expect(r?.planos[0]).toMatchObject({ paraQuem: "Para quem quer tudo pronto", destacar: true });
    expect(r?.planos[1]?.paraQuem).toBe(PARA_QUEM_PADRAO.MANAGED);
    expect(r?.planos[1]?.setores.map((s) => s.code)).toEqual(["bpo", "recrutamento"]);
    expect(r?.planos[0]!.setores.length).toBeGreaterThan(5);
  });
});

describe("lerCamposDoSite", () => {
  const form = (campos: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) f.append(k, x);
    return f;
  };

  it("lê o que a janela manda", () => {
    expect(
      lerCamposDoSite(form({ mostrarNoSite: "on", ordem: "2", destacar: "on", paraQuem: " Para o escritório pequeno ", destaque: ["Um", "", "Três"] })),
    ).toEqual({ campos: { mostrarNoSite: true, ordem: 2, destacar: true, paraQuem: "Para o escritório pequeno", destaques: ["Um", "Três"] } });
  });

  it("interruptores desligados não vêm no formulário", () => {
    expect(lerCamposDoSite(form({ ordem: "" }))).toEqual({ campos: { ...CAMPOS_DO_SITE_PADRAO } });
  });

  it("recusa ordem fora de 1 a 99, texto longo e destaque a mais", () => {
    expect(lerCamposDoSite(form({ ordem: "0" }))).toHaveProperty("erro");
    expect(lerCamposDoSite(form({ ordem: "1.5" }))).toHaveProperty("erro");
    expect(lerCamposDoSite(form({ paraQuem: "x".repeat(241) }))).toHaveProperty("erro");
    expect(lerCamposDoSite(form({ destaque: ["a", "b", "c", "d"] }))).toHaveProperty("erro");
    expect(lerCamposDoSite(form({ destaque: ["x".repeat(81)] }))).toHaveProperty("erro");
  });
});
