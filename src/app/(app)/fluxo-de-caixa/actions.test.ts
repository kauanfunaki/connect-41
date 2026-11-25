import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// As categorias do cliente (25/11/2026, funcionalidade-837): o de-para é da
// empresa e só dela. Sessão, módulos, foco e banco simulados; o plano de
// contas de cada empresa vem pronto; a leitura do CSV e o plano são os reais.

type CatCliente = { id: string; tenantId: string; companyId: string; name: string; line: string; position: number };
type Ligacao = { tenantId: string; companyId: string; categoryId: string; clientCategoryId: string };
type DataDeCaixa = { tenantId: string; companyId: string; receivableDays: number; payableDays: number; balanceSource?: string | null };

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  moduloLigado: true,
  categorias: [] as CatCliente[],
  ligacoes: [] as Ligacao[],
  datas: [] as DataDeCaixa[],
  auditoria: [] as { action: string; entityId?: string }[],
  seq: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => estado.ctx,
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => estado.moduloLigado, setoresDoModulo: async () => ["bpo"] }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => null }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (a: { action: string; entityId?: string }) => {
    estado.auditoria.push(a);
  },
}));
// O plano de contas de cada empresa: o padrão do escritório (fp1, fp2) e um
// próprio de cada (fa1 da e1, fb1 da e2).
vi.mock("@/lib/fluxoDeCaixa/categoriasDoClienteServidor", () => ({
  planoDaEmpresaParaODePara: async (_t: string, companyId: string) => [
    { id: "fp1", name: "Salários", kind: "PAGAR", omieCode: "2.01", companyId: null },
    { id: "fp2", name: "Venda de produtos", kind: "RECEBER", omieCode: "1.01", companyId: null },
    ...(companyId === "e1" ? [{ id: "fa1", name: "Galvanização", kind: "PAGAR", omieCode: null, companyId: "e1" }] : []),
    ...(companyId === "e2" ? [{ id: "fb1", name: "Fretes", kind: "PAGAR", omieCode: null, companyId: "e2" }] : []),
  ],
}));

const NOMES: Record<string, string> = { fp1: "Salários", fp2: "Venda de produtos", fa1: "Galvanização", fb1: "Fretes" };

type Onde = { tenantId?: string; companyId?: string; id?: string };
const casa = (x: { tenantId: string; companyId: string; id?: string }, w: Onde) =>
  (!w.tenantId || x.tenantId === w.tenantId) && (!w.companyId || x.companyId === w.companyId) && (!w.id || x.id === w.id);

const banco = {
  company: {
    findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
      where.tenantId === "t1" && (where.id === "e1" || where.id === "e2") ? { id: where.id } : null,
  },
  clientCategory: {
    findMany: async ({ where }: { where: Onde }) => estado.categorias.filter((c) => casa(c, where)),
    findFirst: async ({ where }: { where: Onde }) => {
      const c = estado.categorias.find((x) => casa(x, where));
      return c ? { ...c, _count: { mappings: estado.ligacoes.filter((l) => l.clientCategoryId === c.id).length } } : null;
    },
    aggregate: async ({ where }: { where: Onde }) => ({
      _max: { position: estado.categorias.filter((c) => casa(c, where)).reduce<number | null>((m, c) => Math.max(m ?? -1, c.position), null) },
    }),
    create: async ({ data }: { data: Omit<CatCliente, "id"> }) => {
      const nova = { ...data, id: `k${++estado.seq}` };
      estado.categorias.push(nova);
      return nova;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<CatCliente> }) => {
      const c = estado.categorias.find((x) => x.id === where.id)!;
      Object.assign(c, data);
      return c;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      estado.categorias = estado.categorias.filter((c) => c.id !== where.id);
      estado.ligacoes = estado.ligacoes.filter((l) => l.clientCategoryId !== where.id);
      return {};
    },
  },
  clientCategoryMapping: {
    findMany: async ({ where }: { where: Onde }) =>
      estado.ligacoes
        .filter((l) => casa(l, where))
        .map((l) => ({ ...l, category: { name: NOMES[l.categoryId] }, clientCategory: estado.categorias.find((c) => c.id === l.clientCategoryId)! })),
    upsert: async ({ where, create, update }: { where: { companyId_categoryId: { companyId: string; categoryId: string } }; create: Ligacao; update: { clientCategoryId: string } }) => {
      const { companyId, categoryId } = where.companyId_categoryId;
      const atual = estado.ligacoes.find((l) => l.companyId === companyId && l.categoryId === categoryId);
      if (atual) atual.clientCategoryId = update.clientCategoryId;
      else estado.ligacoes.push(create);
      return {};
    },
    deleteMany: async ({ where }: { where: Onde & { categoryId: string } }) => {
      const antes = estado.ligacoes.length;
      estado.ligacoes = estado.ligacoes.filter((l) => !(casa(l, where) && l.categoryId === where.categoryId));
      return { count: antes - estado.ligacoes.length };
    },
  },
  cashFlowSettings: {
    findFirst: async ({ where }: { where: Onde }) => estado.datas.find((d) => casa(d, where)) ?? null,
    upsert: async ({ where, create, update }: { where: { companyId: string }; create: DataDeCaixa; update: Partial<DataDeCaixa> }) => {
      const atual = estado.datas.find((d) => d.companyId === where.companyId);
      if (atual) Object.assign(atual, update);
      else estado.datas.push(create);
      return {};
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(banco),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => banco }));

import {
  apagarCategoriaDoCliente,
  copiarDePara,
  criarCategoriaDoCliente,
  importarDePara,
  ligarCategoria,
  preverImportacaoDoDePara,
  salvarDataDeCaixa,
} from "./actions";

function planilha(texto: string): FormData {
  const f = new FormData();
  f.set("arquivo", new File([texto], "de-para.csv", { type: "text/csv" }));
  return f;
}

beforeEach(() => {
  estado.ctx = {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role: "SECTOR_USER",
    sectors: ["bpo"],
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  } as AuthContext;
  estado.moduloLigado = true;
  estado.categorias = [];
  estado.ligacoes = [];
  estado.datas = [];
  estado.auditoria = [];
  estado.seq = 0;
});

describe("categorias do cliente", () => {
  it("cria na empresa, recusa o nome repetido sem olhar caixa e acento, e audita", async () => {
    expect(await criarCategoriaDoCliente("e1", "  Folha  de pagamento ", "pessoal")).toEqual({ success: true });
    expect(estado.categorias).toMatchObject([{ tenantId: "t1", companyId: "e1", name: "Folha de pagamento", line: "pessoal", position: 0 }]);
    expect(await criarCategoriaDoCliente("e1", "FOLHA DE PAGAMENTO", "pessoal")).toEqual({ error: "Já existe uma categoria do cliente com esse nome nesta empresa." });
    // Outra empresa pode ter o mesmo nome: é a nomenclatura dela.
    expect(await criarCategoriaDoCliente("e2", "Folha de pagamento", "pessoal")).toEqual({ success: true });
    expect(estado.auditoria.map((a) => [a.action, a.entityId])).toEqual([
      ["fluxo.categoria_cliente.criar", "e1"],
      ["fluxo.categoria_cliente.criar", "e2"],
    ]);
  });

  it("recusa linha que não existe e empresa de outro escritório", async () => {
    expect(await criarCategoriaDoCliente("e1", "Folha", "galvanizacao")).toEqual({ error: "Escolha a linha do fluxo." });
    expect(await criarCategoriaDoCliente("outra", "Folha", "pessoal")).toEqual({ error: "Empresa não encontrada." });
  });

  it("sem o módulo ligado, não grava", async () => {
    estado.moduloLigado = false;
    expect(await criarCategoriaDoCliente("e1", "Folha", "pessoal")).toEqual({ error: "O Fluxo de caixa não está ligado neste escritório." });
    expect(estado.categorias).toEqual([]);
  });
});

describe("ligar categoria do Omie", () => {
  it("não liga categoria do plano de outra empresa nem categoria do cliente de outra empresa", async () => {
    await criarCategoriaDoCliente("e1", "Folha", "pessoal");
    await criarCategoriaDoCliente("e2", "Folha", "pessoal");
    const [k1, k2] = estado.categorias.map((c) => c.id);
    expect(await ligarCategoria("e1", "fb1", k1!)).toEqual({ error: "Categoria não encontrada no plano desta empresa." });
    expect(await ligarCategoria("e1", "fp1", k2!)).toEqual({ error: "Categoria do cliente não encontrada." });
    expect(await ligarCategoria("e1", "fp1", k1!)).toEqual({ success: true });
    expect(estado.ligacoes).toEqual([{ tenantId: "t1", companyId: "e1", categoryId: "fp1", clientCategoryId: k1 }]);
  });

  it("desligar tira só a ligação desta empresa", async () => {
    await criarCategoriaDoCliente("e1", "Folha", "pessoal");
    await criarCategoriaDoCliente("e2", "Pessoal", "pessoal");
    const [k1, k2] = estado.categorias.map((c) => c.id);
    await ligarCategoria("e1", "fp1", k1!);
    await ligarCategoria("e2", "fp1", k2!);
    expect(await ligarCategoria("e1", "fp1", null)).toEqual({ success: true });
    expect(estado.ligacoes).toEqual([{ tenantId: "t1", companyId: "e2", categoryId: "fp1", clientCategoryId: k2 }]);
  });

  it("apagar a categoria do cliente leva as ligações dela", async () => {
    await criarCategoriaDoCliente("e1", "Folha", "pessoal");
    const k1 = estado.categorias[0]!.id;
    await ligarCategoria("e1", "fp1", k1);
    expect(await apagarCategoriaDoCliente("e1", k1)).toEqual({ success: true });
    expect(estado.categorias).toEqual([]);
    expect(estado.ligacoes).toEqual([]);
  });
});

describe("importar o de-para", () => {
  const csv = "Categoria do cliente;Categoria OMIE\nFolha;Salários\nVendas;1.01\nGalva;Galvanização\nFrete;Fretes\n";

  it("a prévia não grava; a importação grava só na empresa, com a categoria própria dela", async () => {
    const r = await preverImportacaoDoDePara("e1", planilha(csv));
    expect("previa" in r && r.previa.resumo).toMatchObject({ ligacoes: 3, mudam: 3, novas: 3, semPar: 1 });
    expect(estado.categorias).toEqual([]);

    expect(await importarDePara("e1", planilha(csv))).toEqual({ resumo: expect.objectContaining({ mudam: 3, novas: 3 }) });
    expect(new Set(estado.categorias.map((c) => c.companyId))).toEqual(new Set(["e1"]));
    expect(estado.categorias.map((c) => [c.name, c.line])).toEqual([
      ["Folha", "pessoal"],
      ["Vendas", "recebimentos"],
      ["Galva", "outras_saidas"],
    ]);
    expect(estado.ligacoes.map((l) => [l.companyId, l.categoryId])).toEqual([
      ["e1", "fp1"],
      ["e1", "fp2"],
      ["e1", "fa1"],
    ]);
    expect(estado.auditoria.at(-1)?.action).toBe("fluxo.categoria_cliente.importar");
  });

  it("a mesma planilha na outra empresa não mexe na primeira", async () => {
    await importarDePara("e1", planilha(csv));
    const daPrimeira = JSON.stringify({ c: estado.categorias, l: estado.ligacoes });
    await importarDePara("e2", planilha(csv));
    const primeira = { c: estado.categorias.filter((c) => c.companyId === "e1"), l: estado.ligacoes.filter((l) => l.companyId === "e1") };
    expect(JSON.stringify(primeira)).toBe(daPrimeira);
    // Na e2, "Fretes" é do plano dela e "Galvanização" não existe.
    expect(estado.ligacoes.filter((l) => l.companyId === "e2").map((l) => l.categoryId)).toEqual(["fp1", "fp2", "fb1"]);
  });

  it("importar de novo sem mudança diz que nada muda", async () => {
    await importarDePara("e1", planilha(csv));
    expect(await importarDePara("e1", planilha(csv))).toEqual({ error: "A planilha não muda nada no de-para desta empresa." });
  });

  it("copiar de outra empresa casa pelo nome, grava na de destino e deixa de fora o que ela não tem", async () => {
    await importarDePara("e1", planilha(csv));
    const r = await copiarDePara("e2", "e1");
    expect(r).toEqual({ resumo: expect.objectContaining({ mudam: 2, novas: 2, semPar: 1 }) });
    expect(estado.categorias.filter((c) => c.companyId === "e2").map((c) => [c.name, c.line])).toEqual([
      ["Folha", "pessoal"],
      ["Vendas", "recebimentos"],
    ]);
    expect(estado.ligacoes.filter((l) => l.companyId === "e2").map((l) => l.categoryId)).toEqual(["fp1", "fp2"]);
    expect(await copiarDePara("e2", "e1")).toEqual({ error: "Não há nada a copiar: o de-para desta empresa já é igual." });
  });
});

describe("data de caixa", () => {
  it("grava os dias da empresa, só nela, e regrava sem duplicar", async () => {
    expect(await salvarDataDeCaixa("e1", 1, 0)).toEqual({ success: true });
    expect(await salvarDataDeCaixa("e1", 2, 1, "omie")).toEqual({ success: true });
    expect(estado.datas).toEqual([{ tenantId: "t1", companyId: "e1", receivableDays: 2, payableDays: 1, balanceSource: "omie" }]);
    expect(estado.auditoria.map((a) => a.action)).toEqual(["fluxo.data_de_caixa", "fluxo.data_de_caixa"]);
  });

  it("recusa número fora de 0 a 30 ou quebrado", async () => {
    expect(await salvarDataDeCaixa("e1", -1, 0)).toEqual({ error: "Use um número inteiro de 0 a 30 dias." });
    expect(await salvarDataDeCaixa("e1", 1.5, 0)).toEqual({ error: "Use um número inteiro de 0 a 30 dias." });
    expect(await salvarDataDeCaixa("e1", 0, 31)).toEqual({ error: "Use um número inteiro de 0 a 30 dias." });
    expect(estado.datas).toEqual([]);
  });
});

describe("origem do saldo", () => {
  it("automático grava nulo, e origem desconhecida é recusada", async () => {
    expect(await salvarDataDeCaixa("e1", 0, 0, "auto")).toEqual({ success: true });
    expect(estado.datas[0]?.balanceSource).toBeNull();
    expect(await salvarDataDeCaixa("e1", 0, 0, "banco" as never)).toEqual({ error: "Origem do saldo desconhecida." });
  });
});
