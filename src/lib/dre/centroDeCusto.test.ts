import { describe, expect, it } from "vitest";
import { quadroPorCentro } from "./centroDeCusto";
import { montarMapeamento } from "./calculo";
import { calcularDreEconomica, valorDaLinha, LINHA_DE_RESULTADO, type LancamentoFinanceiro } from "./economica";
import { ajustesDaCobranca } from "@/lib/financeiro/cobranca/dre";
import { passaNoFiltroDeCentro } from "@/lib/financeiro/centroDeCusto";

const mapeamento = montarMapeamento([
  { categoria: "Vendas", grupo: "receita_bruta" },
  { categoria: "Aluguel", grupo: "administrativas" },
  { categoria: "Simples", grupo: "impostos" },
  { categoria: "Juros recebidos", grupo: "outras_receitas" },
]);

const l = (kind: "PAGAR" | "RECEBER", centavos: number, categoria: string, centro: string | null, x: Partial<LancamentoFinanceiro> = {}): LancamentoFinanceiro => ({
  kind,
  status: "CONFERIDO",
  centavos,
  categoria,
  centroDeCustoId: centro,
  ...x,
});

const centros = [
  { id: "obra", nome: "Obra Centro", codigo: "OB1", active: true },
  { id: "loja", nome: "Loja", codigo: null, active: true },
  { id: "antigo", nome: "Filial fechada", codigo: null, active: false },
  { id: "parado", nome: "Inativo sem movimento", codigo: null, active: false },
];

const lancamentos: LancamentoFinanceiro[] = [
  l("RECEBER", 100_000, "Vendas", "obra"),
  l("PAGAR", 30_000, "Aluguel", "obra"),
  l("RECEBER", 50_000, "Vendas", "loja"),
  l("PAGAR", 5_000, "Simples", "loja"),
  l("PAGAR", 12_345, "Aluguel", "antigo"),
  l("RECEBER", 7_000, "Juros recebidos", null),
  l("PAGAR", 999, "Sem de-para", null),
  // Renegociado continua receita; cancelado comum e parcela ficam fora.
  l("RECEBER", 20_000, "Vendas", "loja", { status: "CANCELADO", closeReason: "RENEGOCIADO" }),
  l("RECEBER", 80_000, "Vendas", "obra", { status: "CANCELADO", closeReason: "CANCELADO" }),
  l("RECEBER", 11_000, "Vendas", "loja", { parcelaDeAcordo: true }),
];

const ajustes = ajustesDaCobranca(
  [
    { competencia: "2026-09", status: "ATIVO", originalCentavos: 20_000, acordadoCentavos: 22_000, centroDeCustoId: "loja" },
    { competencia: "2026-09", status: "ATIVO", originalCentavos: 10_000, acordadoCentavos: 9_000, centroDeCustoId: null },
  ],
  [{ competencia: "2026-09", centavos: 4_000, centroDeCustoId: "obra" }],
  "2026-09"
);

describe("quadroPorCentro", () => {
  const quadro = quadroPorCentro(lancamentos, ajustes, mapeamento, centros);
  const semFiltro = calcularDreEconomica(lancamentos, mapeamento, undefined, ajustes);

  it("os totais batem com a DRE sem filtro — receita, despesas, resultado e contagem", () => {
    expect(quadro.total.receitaBruta).toBe(valorDaLinha(semFiltro.resultado, "receita_bruta"));
    expect(quadro.total.resultado).toBe(valorDaLinha(semFiltro.resultado, LINHA_DE_RESULTADO));
    expect(quadro.total.lancamentos).toBe(semFiltro.lancamentos);
    const despesasSemFiltro = ["impostos", "cmv", "mao_de_obra", "comerciais", "pessoal", "diretoria", "administrativas", "financeiras", "investimentos", "outras_despesas"]
      .reduce((n, g) => n + (semFiltro.resultado.porGrupo[g] ?? 0), 0);
    expect(quadro.total.despesas).toBe(despesasSemFiltro);
  });

  it("perda e diferença de acordo seguem o centro do título", () => {
    const obra = quadro.linhas.find((x) => x.centroId === "obra")!;
    const loja = quadro.linhas.find((x) => x.centroId === "loja")!;
    // Obra: 1.000 de venda − 300 de aluguel − 40 de perda.
    expect(obra.resultado).toBe(100_000 - 30_000 - 4_000);
    // Loja: 500 + 200 renegociado (receita) + 20 de acréscimo; o imposto fica fora do resultado.
    expect(loja.receitaBruta).toBe(70_000);
    expect(loja.resultado).toBe(70_000 + 2_000);
    expect(loja.despesas).toBe(-5_000);
  });

  it("inativo com movimento aparece, inativo sem movimento não, e sem centro vai por último", () => {
    const ids = quadro.linhas.map((x) => x.centroId);
    expect(ids).toContain("antigo");
    expect(ids).not.toContain("parado");
    expect(ids.at(-1)).toBeNull();
    const sem = quadro.linhas.at(-1)!;
    // 70 de outras receitas − 10 de desconto de acordo; o sem de-para não entra no resultado.
    expect(sem.resultado).toBe(7_000 - 1_000);
  });

  it("o filtro de um centro dá a mesma DRE que a linha do quadro", () => {
    for (const linha of quadro.linhas) {
      const filtro = linha.centroId === null ? ({ tipo: "sem" } as const) : ({ tipo: "centro", id: linha.centroId } as const);
      const dre = calcularDreEconomica(
        lancamentos.filter((x) => passaNoFiltroDeCentro(x.centroDeCustoId, filtro)),
        mapeamento,
        undefined,
        ajustes.filter((x) => passaNoFiltroDeCentro(x.centroDeCustoId, filtro))
      );
      expect(valorDaLinha(dre.resultado, LINHA_DE_RESULTADO)).toBe(linha.resultado);
    }
  });

  it("sem centro cadastrado, a única linha é sem centro e bate com o total", () => {
    const q = quadroPorCentro([l("RECEBER", 1_000, "Vendas", null)], [], mapeamento, []);
    expect(q.linhas).toHaveLength(1);
    expect(q.linhas[0]!.centroId).toBeNull();
    expect(q.total.resultado).toBe(1_000);
  });

  it("centro desconhecido não some do total", () => {
    const q = quadroPorCentro([l("RECEBER", 1_000, "Vendas", "fantasma")], [], mapeamento, []);
    expect(q.total.receitaBruta).toBe(1_000);
  });
});
