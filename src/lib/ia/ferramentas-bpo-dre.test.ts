import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELO_PADRAO } from "@/lib/dre/estrutura";

// A Ceci corrigindo a DRE (30/10/2026): o que ela lê sai da mesma leitura da
// tela; o banco é de mentira, a regra é a de verdade.

type Fonte = { tipo: "financeiro" | "import"; arquivos: string[]; importadoEm: Date | null };
let FONTE: Fonte = { tipo: "financeiro", arquivos: [], importadoEm: null };
const CATEGORIAS = [
  { id: "c-ped", nome: "Pedágio", grupo: "custo_administrativo", origem: "pagamento" as const },
  { id: "c-frete", nome: "Fretes", grupo: "custo_operacional", origem: "pagamento" as const },
  { id: "c-venda", nome: "Vendas", grupo: "receita_bruta", origem: "recebimento" as const },
];

vi.mock("@/lib/dre/data", () => ({
  inicioDoMes: (ano: number, mes: number) => new Date(Date.UTC(ano, mes - 1, 1, 3)),
  mesesComMovimento: async () => [{ ano: 2026, mes: 9 }],
  dreDoMes: async () => ({
    resultado: {
      porCategoria: { custo_administrativo: [{ categoria: "Pedágio", centavos: -50_000, origem: "pagamento" }] },
      naoClassificado: [{ categoria: "Diversos", centavos: -1_000, origem: "pagamento" }],
    },
    categorias: CATEGORIAS,
    lancamentos: 3,
    fonte: FONTE,
  }),
}));
vi.mock("@/lib/dre/modeloDaEmpresa", () => ({ modeloDaEmpresa: async () => MODELO_PADRAO }));
vi.mock("@/lib/financeiro/baixa/consultas", () => ({
  baixasNoPeriodo: () => ({}),
  movimentosDeCaixa: async () => [
    { entryId: "e1", categoryId: "c-ped", centavos: -30_000, parte: "principal" },
    { entryId: "e2", categoryId: "c-ped", centavos: -20_000, parte: "principal" },
    { entryId: "e3", categoryId: "c-ped", centavos: -500, parte: "encargos" },
    { entryId: "e9", categoryId: "c-frete", centavos: -9_000, parte: "principal" },
  ],
}));
const company = { findFirst: vi.fn(async () => ({ id: "emp", name: "Transportadora", displayName: null })) };
const financeEntry = {
  findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => ({
      id,
      description: `Conta ${id}`,
      dueDate: new Date("2026-09-10T12:00:00Z"),
      kind: "PAGAR",
      counterparty: { name: "Fornecedor" },
      _count: { allocations: id === "e2" ? 2 : 0 },
    }))
  ),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ company, financeEntry }) }));

const { FERRAMENTAS_DA_DRE_DO_BPO: F } = await import("./ferramentas-bpo-dre");

const ctx = (modulos = "bpo_dre") => ({ tenantId: "t1", userId: "u", escopo: { modulos } as Record<string, string> });
const ler = (nome: string, args: Record<string, unknown>, c = ctx()) => F[nome]!.executar!(args, c) as Promise<Record<string, unknown>>;

beforeEach(() => {
  FONTE = { tipo: "financeiro", arquivos: [], importadoEm: null };
});

describe("ver_linha_da_dre", () => {
  it("quem não opera a DRE não lê", async () => {
    await expect(ler("ver_linha_da_dre", { empresaId: "emp", competencia: "", linha: "Custo Administrativo" }, ctx("bpo_contas_pagar"))).rejects.toThrow("/dre");
  });

  it("devolve as categorias da linha e para onde dá para mover, com o lado de cada uma", async () => {
    const r = await ler("ver_linha_da_dre", { empresaId: "emp", competencia: "2026-09", linha: "custo administrativo" });
    expect(r.linha).toBe("Custo Administrativo");
    expect(r.categorias).toEqual([{ categoria: "Pedágio", valor: -500, lado: "pagamento" }]);
    const destinos = r.linhasParaMover as { linha: string; aceita: string }[];
    expect(destinos.find((d) => d.linha === "Receita Bruta")?.aceita).toBe("recebimento");
    expect(destinos.find((d) => d.linha === "Custo Operacional")?.aceita).toBe("pagamento");
    expect(destinos.find((d) => /Desconsiderar/.test(d.linha))?.aceita).toBe("os dois");
  });

  it("aceita a fila do que não tem classificação", async () => {
    const r = await ler("ver_linha_da_dre", { empresaId: "emp", competencia: "", linha: "sem classificação" });
    expect(r.categorias).toEqual([{ categoria: "Diversos", valor: -10, lado: "pagamento" }]);
  });

  it("linha que o modelo não tem é recusada com a lista certa", async () => {
    await expect(ler("ver_linha_da_dre", { empresaId: "emp", competencia: "", linha: "EBITDA" })).rejects.toThrow("Custo Operacional");
  });
});

describe("lancamentos_da_categoria", () => {
  it("lista as contas da categoria no mês, da maior para a menor, e marca o que trocar a categoria não resolve", async () => {
    const r = await ler("lancamentos_da_categoria", { empresaId: "emp", competencia: "2026-09", categoria: "pedagio" });
    const lancamentos = r.lancamentos as { id: string; valorNoMes: number; rateada?: boolean; soJurosOuDesconto?: boolean }[];
    expect(lancamentos.map((l) => l.id)).toEqual(["e1", "e2", "e3"]);
    expect(lancamentos[0]).toMatchObject({ id: "e1", valorNoMes: 300 });
    expect(lancamentos[1]!.rateada).toBe(true);
    expect(lancamentos[2]!.soJurosOuDesconto).toBe(true);
  });

  it("oferece só categorias do mesmo lado, sem a própria", async () => {
    const r = await ler("lancamentos_da_categoria", { empresaId: "emp", competencia: "2026-09", categoria: "Pedágio" });
    expect(r.categoriasDoMesmoLado).toEqual([{ id: "c-frete", categoria: "Fretes", linha: "Custo Operacional" }]);
  });

  it("DRE de planilha importada não tem lançamento para trocar", async () => {
    FONTE = { tipo: "import", arquivos: ["x.xlsx"], importadoEm: null };
    const r = await ler("lancamentos_da_categoria", { empresaId: "emp", competencia: "2026-09", categoria: "Pedágio" });
    expect(String(r.aviso)).toContain("planilha");
  });
});

describe("as de escrita", () => {
  it("não executam: viram proposta", () => {
    expect(F.propor_mover_categoria_na_dre!.executar).toBeUndefined();
    expect(F.propor_recategorizar_lancamentos!.executar).toBeUndefined();
    expect(F.propor_mover_categoria_na_dre!.def.natureza).toBe("escrita");
    expect(F.propor_recategorizar_lancamentos!.def.natureza).toBe("escrita");
  });
});
