import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ValorDaLinha } from "@/lib/dre/calculo";

// A DRE da equipe e a do cliente dão o mesmo número em cada linha, para a
// mesma empresa e o mesmo período (21/10/2026). O banco e as baixas são
// simulados; os loaders (`data.ts`, `dataEconomica.ts`), o modelo da empresa,
// o de-para e o cálculo são os reais. O lado da equipe é montado como as telas
// montam: `opcoesDaUrl` com o modelo da empresa e o que vier em `impostos=`.

type Categoria = { id: string; name: string; dreGroup: string | null; companyId: string | null };
type Movimento = { kind: "PAGAR" | "RECEBER"; centavos: number; categoryId: string | null; paidAt: Date; competence: string };

const estado = vi.hoisted(() => ({
  dreModelo: null as string | null,
  categorias: [] as Categoria[],
  movimentos: [] as Movimento[],
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: { findFirst: async () => ({ dreModelo: estado.dreModelo }) },
    financeCategory: { findMany: async () => estado.categorias },
    dreCategoryMapping: { findMany: async () => [] },
    dreImport: { findMany: async () => [] },
    financeEntryPayment: {
      findMany: async () => estado.movimentos.map((m) => ({ paidAt: m.paidAt })),
    },
    collectionAgreement: { findMany: async () => [] },
    financeEntry: {
      // As contas por competência (`serieEconomica`) e as perdas (`ajustesDoPeriodo`, sempre vazias aqui).
      findMany: async ({ where }: { where: { competence?: { in: string[] }; closeReason?: string } }) => {
        if (where.closeReason === "PERDA") return [];
        const pedidas = new Set(where.competence?.in ?? []);
        return estado.movimentos
          .filter((m) => pedidas.has(m.competence))
          .map((m, i) => ({
            id: `e${i}`,
            kind: m.kind,
            status: "PAGO",
            closeReason: null,
            agreementId: null,
            amount: { toString: () => (m.centavos / 100).toFixed(2) },
            categoryId: m.categoryId,
            competence: m.competence,
            paidAt: m.paidAt,
            dueDate: m.paidAt,
            costCenterId: null,
            allocations: [],
          }));
      },
    },
  }),
}));

vi.mock("@/lib/financeiro/baixa/consultas", () => ({
  baixasNoPeriodo: (_e: unknown, de: Date, ate: Date) => ({ paidAt: { gte: de, lt: ate } }),
  movimentosDeCaixa: async (where: { paidAt: { gte: Date; lt: Date } }) =>
    estado.movimentos
      .filter((m) => m.paidAt >= where.paidAt.gte && m.paidAt < where.paidAt.lt)
      .map((m) => ({ kind: m.kind, centavos: m.centavos, categoryId: m.categoryId, paidAt: m.paidAt })),
}));

import { dreDoAnoDaEmpresa, dreDoMes } from "@/lib/dre/data";
import { dreDoAno, linhaAoLongoDoAno, type DreAnual } from "@/lib/dre/anual";
import { serieEconomica } from "@/lib/dre/dataEconomica";
import { modeloDaEmpresa } from "@/lib/dre/modeloDaEmpresa";
import { modeloDoCodigo, opcoesDaUrl } from "@/lib/dre/estrutura";
import { dreDoClienteNoAno, dreDoClienteNoMes, opcoesDoCliente } from "@/lib/dre/doCliente";

const T = "t1";
const C = "padaria";

/** Meio-dia em São Paulo do dia pedido — longe da virada do mês. */
const dia = (ano: number, mes: number, d: number) => new Date(Date.UTC(ano, mes - 1, d, 15));

function mov(kind: Movimento["kind"], reais: number, categoryId: string, ano: number, mes: number): Movimento {
  return { kind, centavos: Math.round(reais * 100), categoryId, paidAt: dia(ano, mes, 10), competence: `${ano}-${String(mes).padStart(2, "0")}` };
}

beforeEach(() => {
  // Os códigos do "despesas por área" no `dreGroup`: no padrão, `cmv` e
  // `pessoal` caem no custo operacional e no administrativo (o de-para do
  // modelo antigo); no por área, cada um na linha dele. O mesmo plano dá DREs
  // diferentes conforme o modelo — e a do cliente tem de seguir o da empresa.
  estado.categorias = [
    { id: "venda", name: "Clientes - Venda", dreGroup: "receita_bruta", companyId: null },
    { id: "simples", name: "Simples Nacional", dreGroup: "impostos", companyId: null },
    { id: "insumos", name: "Insumos", dreGroup: "cmv", companyId: null },
    { id: "salarios", name: "Salários", dreGroup: "pessoal", companyId: null },
    { id: "tarifa", name: "Tarifa bancária", dreGroup: "financeiras", companyId: null },
    { id: "solta", name: "Categoria sem grupo", dreGroup: null, companyId: C },
  ];
  estado.movimentos = [
    mov("RECEBER", 10_000, "venda", 2026, 8),
    mov("PAGAR", 600, "simples", 2026, 8),
    mov("PAGAR", 3_000, "insumos", 2026, 8),
    mov("RECEBER", 12_500.5, "venda", 2026, 9),
    mov("PAGAR", 750.25, "simples", 2026, 9),
    mov("PAGAR", 4_100, "insumos", 2026, 9),
    mov("PAGAR", 2_000, "salarios", 2026, 9),
    mov("PAGAR", 89.9, "tarifa", 2026, 9),
    // Sem grupo: vai para a fila da equipe e não pode mudar linha nenhuma.
    mov("PAGAR", 120, "solta", 2026, 9),
  ];
});

/** Código e valor de cada linha — o que a tabela mostra. */
const numeros = (linhas: ValorDaLinha[]) => linhas.map((l) => [l.code, l.centavos ?? l.fracao]);
const doAno = (a: DreAnual) => a.colunas.map((c) => numeros(c.linhas));

describe.each([
  ["padrão", null],
  ["despesas por área", "por_area"],
])("DRE da equipe × DRE do cliente — modelo %s", (_nome, codigo) => {
  beforeEach(() => {
    estado.dreModelo = codigo;
  });

  it("o mês de caixa dá o mesmo valor em cada linha, e o mês anterior também", async () => {
    // A equipe, como `/dre` abre: sem `impostos=` na URL.
    const opcoesDaEquipe = opcoesDaUrl(undefined, await modeloDaEmpresa(T, C));
    const equipe = await dreDoMes(T, C, { ano: 2026, mes: 9 }, opcoesDaEquipe);
    const anteriorDaEquipe = await dreDoMes(T, C, { ano: 2026, mes: 8 }, opcoesDaEquipe);

    const cliente = await dreDoClienteNoMes(T, C, "2026-09", "caixa", opcoesDoCliente(await modeloDaEmpresa(T, C)), true);

    expect(equipe.resultado.modelo ?? "padrao").toBe(codigo ?? "padrao");
    expect(numeros(cliente.resultado.linhas)).toEqual(numeros(equipe.resultado.linhas));
    expect(numeros(cliente.anterior!.linhas)).toEqual(numeros(anteriorDaEquipe.resultado.linhas));
    // As linhas são as do modelo da empresa, na ordem dele.
    expect(cliente.resultado.linhas.map((l) => l.code)).toEqual(modeloDoCodigo(codigo).linhas.map((l) => l.code));
    // O que está sem grupo fica na fila da equipe, fora das linhas dos dois lados.
    expect(equipe.resultado.naoClassificado.map((n) => n.categoria)).toEqual(["Categoria sem grupo"]);
  });

  it("o ano inteiro de caixa dá o mesmo valor em cada linha e coluna", async () => {
    const opcoesDaEquipe = opcoesDaUrl(undefined, await modeloDaEmpresa(T, C));
    const equipe = dreDoAno((await dreDoAnoDaEmpresa(T, C, 2026, opcoesDaEquipe)).meses, opcoesDaEquipe);
    const cliente = await dreDoClienteNoAno(T, C, 2026, "caixa", opcoesDoCliente(await modeloDaEmpresa(T, C)));

    expect(cliente.modelo ?? "padrao").toBe(codigo ?? "padrao");
    expect(doAno(cliente)).toEqual(doAno(equipe));
    expect(cliente.mesesComMovimento).toBe(2);
  });

  it("a competência do mês dá o mesmo valor em cada linha que a DRE econômica da equipe", async () => {
    const opcoesDaEquipe = opcoesDaUrl(undefined, await modeloDaEmpresa(T, C));
    const equipe = (await serieEconomica(T, C, ["2026-09"], { tipo: "todos" }, opcoesDaEquipe)).get("2026-09")!;
    const cliente = await dreDoClienteNoMes(T, C, "2026-09", "competencia", opcoesDoCliente(await modeloDaEmpresa(T, C)), false);

    expect(numeros(cliente.resultado.linhas)).toEqual(numeros(equipe.resultado.linhas));
    expect(cliente.anterior).not.toBeNull();
  });

  it("caixa e competência fecham igual quando tudo foi pago no próprio mês", async () => {
    const opcoes = opcoesDoCliente(await modeloDaEmpresa(T, C));
    const caixa = await dreDoClienteNoAno(T, C, 2026, "caixa", opcoes);
    const competencia = await dreDoClienteNoAno(T, C, 2026, "competencia", opcoes);
    const resultado = modeloDoCodigo(codigo).linhaDoResultado;
    expect(linhaAoLongoDoAno(competencia, resultado)).toEqual(linhaAoLongoDoAno(caixa, resultado));
  });
});

describe("o que é só da equipe", () => {
  it("“Impostos fora do resultado” muda a tela da equipe, não a do cliente", async () => {
    estado.dreModelo = null;
    const modelo = await modeloDaEmpresa(T, C);
    const foraDaEquipe = await dreDoMes(T, C, { ano: 2026, mes: 9 }, opcoesDaUrl("fora", modelo));
    const cliente = await dreDoClienteNoMes(T, C, "2026-09", "caixa", opcoesDoCliente(modelo), false);
    const resultado = modelo.linhaDoResultado;
    const valor = (linhas: ValorDaLinha[]) => linhas.find((l) => l.code === resultado)!.centavos;

    // A diferença é o imposto do mês: R$ 750,25.
    expect(valor(foraDaEquipe.resultado.linhas)! - valor(cliente.resultado.linhas)!).toBe(75_025);
    expect(opcoesDoCliente(modelo).impostosNoEbitda).toBe(true);
  });
});
