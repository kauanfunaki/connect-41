import { describe, it, expect } from "vitest";
import { montarMapeamento, type LancamentoDoDre } from "./calculo";
import {
  calcularDreEconomica,
  comRotulosEconomicos,
  valorDaLinha,
  paraLancamentoDoDre,
  LINHA_DE_RESULTADO,
} from "./economica";
import {
  reconciliarLucroCaixa,
  compararResultados,
  resultadoDePorGrupo,
  somarPorGrupo,
  atrasoMedioEmDias,
  projetarSerie,
  simularCenario,
  PREMISSAS_ZERADAS,
  calcularIndicadores,
} from "./analises";
import { OPCOES_PADRAO } from "./estrutura";

const MAPA = montarMapeamento([
  { categoria: "Vendas", grupo: "receita_bruta" },
  { categoria: "Simples Nacional", grupo: "impostos" },
  { categoria: "Fornecedores", grupo: "cmv" },
  { categoria: "Aluguel", grupo: "administrativas" },
  { categoria: "Transferência", grupo: "transferencia" },
]);

const rec = (categoria: string | null, centavos: number): LancamentoDoDre => paraLancamentoDoDre({ kind: "RECEBER", centavos, categoria });
const pag = (categoria: string | null, centavos: number): LancamentoDoDre => paraLancamentoDoDre({ kind: "PAGAR", centavos, categoria });

describe("DRE econômica", () => {
  it("ignora cancelado, conta provisório e reusa a estrutura da 41", () => {
    const r = calcularDreEconomica(
      [
        { kind: "RECEBER", status: "CONFERIDO", centavos: 100_000, categoria: "Vendas" },
        { kind: "PAGAR", status: "PROVISORIO", centavos: 30_000, categoria: "Fornecedores" },
        { kind: "PAGAR", status: "CANCELADO", centavos: 50_000, categoria: "Aluguel" },
        { kind: "PAGAR", status: "PAGO", centavos: 10_000, categoria: "Aluguel" },
      ],
      MAPA
    );
    expect(r.lancamentos).toBe(3);
    expect(r.provisorios).toBe(1);
    expect(valorDaLinha(r.resultado, "margem_contribuicao")).toBe(70_000);
    expect(valorDaLinha(r.resultado, LINHA_DE_RESULTADO)).toBe(60_000);
  });

  it("renomeia só o rótulo das linhas de caixa", () => {
    const r = comRotulosEconomicos(calcularDreEconomica([], MAPA).resultado);
    expect(r.linhas.find((l) => l.code === LINHA_DE_RESULTADO)!.label).toBe("RESULTADO DO PERÍODO");
    expect(r.linhas.find((l) => l.code === "receita_bruta")!.label).toBe("RECEITA BRUTA");
  });
});

describe("reconciliarLucroCaixa", () => {
  const conjuntos = {
    ambos: [rec("Vendas", 50_000), pag("Aluguel", 8_000)],
    soCompetencia: [rec("Vendas", 30_000), pag("Fornecedores", 12_000)],
    soCaixa: [rec("Vendas", 20_000), pag("Fornecedores", 5_000), pag("Simples Nacional", 3_000), rec("Transferência", 1_000), pag(null, 700)],
  };
  const passos = reconciliarLucroCaixa(conjuntos, MAPA);
  const v = (code: string) => passos.find((p) => p.code === code)!.centavos;

  it("parte do resultado econômico e chega no de caixa sem resíduo", () => {
    expect(v("resultado_economico")).toBe(50_000 - 8_000 + 30_000 - 12_000);
    const ajustes = v("receitas_nao_recebidas") + v("despesas_nao_pagas") + v("recebimentos_de_outros_meses") + v("pagamentos_de_outros_meses");
    expect(v("resultado_economico") + ajustes).toBe(v("resultado_caixa"));
    // O imposto fica fora da margem pela opção padrão — cai em "fora do resultado".
    expect(v("resultado_caixa")).toBe(50_000 - 8_000 + 20_000 - 5_000);
  });

  it("a variação de caixa é tudo que andou, e fecha pelo passo de fora do resultado", () => {
    expect(v("variacao_de_caixa")).toBe(50_000 - 8_000 + 20_000 - 5_000 - 3_000 + 1_000 - 700);
    expect(v("resultado_caixa") + v("fora_do_resultado")).toBe(v("variacao_de_caixa"));
    expect(v("fora_do_resultado")).toBe(-3_000 + 1_000 - 700);
  });

  it("com a margem partindo da líquida, o imposto entra no resultado", () => {
    const p = reconciliarLucroCaixa(conjuntos, MAPA, { ...OPCOES_PADRAO, margemPartirDaLiquida: true });
    expect(p.find((x) => x.code === "fora_do_resultado")!.centavos).toBe(1_000 - 700);
  });
});

describe("comparativos", () => {
  it("variação divide pelo valor absoluto do comparado", () => {
    const atual = resultadoDePorGrupo({ receita_bruta: 120_000, administrativas: -15_000 });
    const antes = resultadoDePorGrupo({ receita_bruta: 100_000, administrativas: -10_000 });
    const linhas = compararResultados(atual, antes, ["receita_bruta", "administrativas", "cmv"]);
    expect(linhas[0]).toMatchObject({ diferenca: 20_000, variacao: 0.2 });
    // Despesa de −100 para −150: cresceu 50%, com sinal de piora na diferença.
    expect(linhas[1]).toMatchObject({ diferenca: -5_000, variacao: -0.5 });
    expect(linhas[2]!.variacao).toBeNull();
  });

  it("soma por grupo para o acumulado", () => {
    const s = somarPorGrupo([{ receita_bruta: 1 }, { receita_bruta: 2, cmv: -1 }]);
    expect(s.receita_bruta).toBe(3);
    expect(s.cmv).toBe(-1);
    expect(s.pessoal).toBe(0);
  });
});

describe("atrasoMedioEmDias", () => {
  it("média simples, positivo é atraso", () => {
    expect(atrasoMedioEmDias([])).toBeNull();
    expect(
      atrasoMedioEmDias([
        { vencimentoKey: "2026-09-10", liquidadoKey: "2026-09-15" },
        { vencimentoKey: "2026-09-10", liquidadoKey: "2026-09-09" },
      ])
    ).toBe(2);
  });
});

describe("projetarSerie", () => {
  it("série constante projeta constante nos três métodos", () => {
    const h = Array.from({ length: 12 }, () => 10_000);
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(projetarSerie(h, "media_movel", 3)).toEqual([10_000, 10_000, 10_000]);
    expect(projetarSerie(h, "tendencia", 3)).toEqual([10_000, 10_000, 10_000]);
    expect(projetarSerie(h, "sazonalidade", 2, meses, [1, 2])).toEqual([10_000, 10_000]);
  });

  it("tendência estende a reta; média móvel anda a janela com a própria projeção", () => {
    expect(projetarSerie([100, 200, 300], "tendencia", 2)).toEqual([400, 500]);
    expect(projetarSerie([100, 200, 300], "media_movel", 2)).toEqual([200, 233]);
  });

  it("sazonalidade aplica o peso do mesmo mês do calendário", () => {
    // Dezembro vale o dobro da média num histórico sem tendência.
    const h = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 200];
    const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const [jan, dez] = projetarSerie(h, "sazonalidade", 2, meses, [1, 12]);
    // A reta tem leve inclinação por causa do próprio dezembro — daí a tolerância.
    expect(dez! / jan!).toBeCloseTo(2, 0);
  });

  it("sem histórico projeta zero", () => {
    expect(projetarSerie([], "tendencia", 2)).toEqual([0, 0]);
  });
});

describe("simularCenario", () => {
  const base = { receita_bruta: 100_000, impostos: -6_000, cmv: -30_000, mao_de_obra: -10_000, comerciais: -4_000, pessoal: -20_000, administrativas: -5_000, financeiras: -1_000, investimentos: -2_000 };

  it("premissas zeradas não mudam nada", () => {
    expect(simularCenario(base, PREMISSAS_ZERADAS)).toEqual(base);
  });

  it("receita arrasta o variável; fixo e investimento ficam", () => {
    const s = simularCenario(base, { receita: 10, cmv: 0, despesasFixas: 0, financeiras: 0 });
    expect(s.receita_bruta).toBe(110_000);
    expect(s.cmv).toBe(-33_000);
    expect(s.impostos).toBe(-6_600);
    expect(s.pessoal).toBe(-20_000);
    expect(s.investimentos).toBe(-2_000);
  });

  it("CMV soma a própria premissa à da receita, em centavos inteiros", () => {
    const s = simularCenario(base, { receita: 10, cmv: 5, despesasFixas: 3, financeiras: -50 });
    expect(s.cmv).toBe(-34_650);
    expect(s.administrativas).toBe(-5_150);
    expect(s.financeiras).toBe(-500);
    expect(Object.values(s).every(Number.isInteger)).toBe(true);
  });
});

describe("calcularIndicadores", () => {
  const economico = resultadoDePorGrupo({ receita_bruta: 100_000, cmv: -40_000, pessoal: -20_000 });
  const dados = {
    economico,
    diasNoMes: 30,
    aReceberEmAberto: 50_000,
    aReceberVencido: 10_000,
    aPagarEmAberto: 30_000,
    variacoesDeCaixa: [-1_000, -2_000, -3_000, -6_000],
    maiorClienteEmAberto: 25_000,
  };
  const ind = calcularIndicadores(dados);
  const valor = (c: string) => ind.find((i) => i.codigo === c)!.valor;

  it("rentabilidade e capital de giro", () => {
    expect(valor("margem_contribuicao")).toBeCloseTo(0.6);
    expect(valor("pmr")).toBe(15);
    expect(valor("pmp")).toBe(15);
    expect(valor("ncg")).toBe(20_000);
    expect(valor("ciclo_financeiro")).toBe(0);
  });

  it("caixa e risco", () => {
    expect(valor("variacao_media_caixa")).toBe(Math.round((-2_000 - 3_000 - 6_000) / 3));
    expect(valor("vencido_a_receber")).toBeCloseTo(0.2);
    expect(valor("concentracao_cliente")).toBeCloseTo(0.5);
  });

  // Sem dado, aparece sem valor e com o motivo — nunca estimado.
  it("indicador sem dado traz o motivo", () => {
    const runway = ind.find((i) => i.codigo === "runway")!;
    expect(runway.valor).toBeNull();
    expect(runway.motivo).toBeTruthy();
    const semReceita = calcularIndicadores({ ...dados, economico: resultadoDePorGrupo({}) });
    expect(semReceita.find((i) => i.codigo === "pmr")).toMatchObject({ valor: null });
    expect(semReceita.find((i) => i.codigo === "pmr")!.motivo).toBeTruthy();
  });
});
