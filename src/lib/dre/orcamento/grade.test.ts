import { describe, expect, it } from "vitest";
import {
  gradeVazia,
  gradeDeLinhas,
  linhasDaGrade,
  lerGrade,
  campoDaCelula,
  porGrupoOrcado,
  totalDoGrupo,
  lerReajuste,
  reajustar,
  copiarComReajuste,
  gradeDoRealizado,
  textoDaCelula,
  MAIOR_VALOR_ORCADO,
} from "./grade";
import { GRUPOS } from "@/lib/dre/estrutura";
import { resultadoDePorGrupo } from "@/lib/dre/analises";
import { valorDaLinha } from "@/lib/dre/economica";

describe("grade ↔ linhas", () => {
  it("só grava célula diferente de zero, e volta igual", () => {
    const g = gradeVazia();
    g.receita_bruta![0] = 100_000;
    g.administrativas![11] = 5_000;
    const linhas = linhasDaGrade(g);
    expect(linhas).toEqual([
      { groupCode: "receita_bruta", month: 1, centavos: 100_000 },
      { groupCode: "administrativas", month: 12, centavos: 5_000 },
    ]);
    expect(gradeDeLinhas(linhas)).toEqual(g);
  });

  it("linha de grupo que não existe mais, ou mês fora de 1..12, é ignorada", () => {
    const g = gradeDeLinhas([
      { groupCode: "grupo_antigo", month: 1, centavos: 1 },
      { groupCode: "cmv", month: 13, centavos: 1 },
    ]);
    expect(g).toEqual(gradeVazia());
  });

  it("a grade vazia tem os doze grupos com doze meses", () => {
    const g = gradeVazia();
    expect(Object.keys(g)).toEqual(GRUPOS.map((x) => x.code));
    expect(Object.values(g).every((m) => m.length === 12 && m.every((v) => v === 0))).toBe(true);
  });
});

describe("lerGrade — validação", () => {
  it("lê valores no formato brasileiro; vazio é zero", () => {
    const r = lerGrade([
      [campoDaCelula("receita_bruta", 1), "1.234,56"],
      [campoDaCelula("receita_bruta", 2), ""],
      [campoDaCelula("pessoal", 12), "10"],
      ["companyId", "ignorado"],
    ]);
    expect(r.ok && r.grade.receita_bruta!.slice(0, 2)).toEqual([123_456, 0]);
    expect(r.ok && r.grade.pessoal![11]).toBe(1_000);
  });

  it("recusa negativo, ilegível, três casas e acima do teto dizendo grupo e mês", () => {
    const negativo = lerGrade([[campoDaCelula("cmv", 3), "-10"]]);
    expect(negativo).toMatchObject({ ok: false, erro: expect.stringMatching(/CMV sobre Receita Bruta, Mar: use valor positivo/) });
    expect(lerGrade([[campoDaCelula("cmv", 3), "abc"]])).toMatchObject({ ok: false, erro: expect.stringMatching(/ilegível/) });
    expect(lerGrade([[campoDaCelula("cmv", 3), "10,555"]]).ok).toBe(false);
    expect(lerGrade([[campoDaCelula("cmv", 3), "10000000000000"]])).toMatchObject({ ok: false, erro: expect.stringMatching(/limite/) });
  });

  it("recusa célula de grupo ou mês que não existe", () => {
    expect(lerGrade([["v:inventado:1", "10"]]).ok).toBe(false);
    expect(lerGrade([[campoDaCelula("cmv", 0), "10"]]).ok).toBe(false);
    expect(lerGrade([[campoDaCelula("cmv", 13), "10"]]).ok).toBe(false);
  });
});

describe("porGrupoOrcado — o sinal vem da origem do grupo", () => {
  const g = gradeVazia();
  g.receita_bruta = [100_000, 110_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  g.impostos![0] = 6_000;
  g.cmv![0] = 30_000;
  g.cmv![1] = 33_000;
  g.pessoal![0] = 20_000;
  g.outras_receitas![1] = 1_000;

  it("recebimento soma, pagamento subtrai, e meses somam", () => {
    const jan = porGrupoOrcado(g, [1]);
    expect(jan.receita_bruta).toBe(100_000);
    expect(jan.cmv).toBe(-30_000);
    const acumulado = porGrupoOrcado(g, [1, 2]);
    expect(acumulado.receita_bruta).toBe(210_000);
    expect(acumulado.cmv).toBe(-63_000);
    expect(acumulado.outras_receitas).toBe(1_000);
    expect(acumulado.nao_classificado).toBe(0);
  });

  it("os subtotais saem do mesmo motor de linhas da DRE", () => {
    const r = resultadoDePorGrupo(porGrupoOrcado(g, [1]));
    expect(valorDaLinha(r, "receita_liquida")).toBe(94_000);
    // A margem parte da bruta (padrão da planilha): 100.000 − 30.000.
    expect(valorDaLinha(r, "margem_contribuicao")).toBe(70_000);
    expect(valorDaLinha(r, "gerador_de_caixa")).toBe(50_000);
    expect(valorDaLinha(r, "fluxo_de_caixa_livre")).toBe(50_000);
  });

  it("total anual do grupo em magnitude", () => {
    expect(totalDoGrupo(g, "cmv")).toBe(63_000);
  });
});

describe("reajuste", () => {
  it("lê o percentual", () => {
    expect(lerReajuste("")).toEqual({ ok: true, pct: 0 });
    expect(lerReajuste("4,5")).toEqual({ ok: true, pct: 4.5 });
    expect(lerReajuste("-3.25%")).toEqual({ ok: true, pct: -3.25 });
    expect(lerReajuste("-100").ok).toBe(false);
    expect(lerReajuste("1000.01").ok).toBe(false);
    expect(lerReajuste("5,123").ok).toBe(false);
    expect(lerReajuste("dez").ok).toBe(false);
  });

  it("arredonda em centavos na célula, meio centavo para cima", () => {
    expect(reajustar(10_000, 5)).toBe(10_500);
    // 333 × 1,015 = 337,995 → 338
    expect(reajustar(333, 1.5)).toBe(338);
    // 101 × 0,995 = 100,495 → 100
    expect(reajustar(101, -0.5)).toBe(100);
    // 1 × 1,5 = 1,5 → 2 (meio sobe)
    expect(reajustar(1, 50)).toBe(2);
    expect(reajustar(0, 10)).toBe(0);
    expect(reajustar(12_345, 0)).toBe(12_345);
  });

  it("não perde precisão perto do teto do Decimal(14,2)", () => {
    // 999.999.999.999,99 × 1,0001 passa de 2^53 como float; em BigInt, exato.
    expect(reajustar(99_999_999_999_999, 0.01)).toBe(100_009_999_999_999);
  });

  it("copiar com reajuste aplica célula a célula e respeita o teto", () => {
    const g = gradeVazia();
    g.receita_bruta = [333, 333, 333, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    g.pessoal![0] = MAIOR_VALOR_ORCADO;
    const c = copiarComReajuste(g, 1.5);
    // Cada célula arredonda sozinha: 338 × 3, e não round(999 × 1,015) = 1.014.
    expect(totalDoGrupo(c, "receita_bruta")).toBe(1_014);
    expect(c.receita_bruta!.slice(0, 3)).toEqual([338, 338, 338]);
    expect(c.pessoal![0]).toBe(MAIOR_VALOR_ORCADO);
    // A original não muda.
    expect(g.receita_bruta![0]).toBe(333);
  });
});

describe("gradeDoRealizado", () => {
  it("vira magnitude pela origem, reajusta, e zera o que andou contra a origem", () => {
    const janeiro = { receita_bruta: 100_000, cmv: -40_000, administrativas: 2_500, outras_receitas: -300, nao_classificado: -999 };
    const porMes = [janeiro, ...Array.from({ length: 11 }, () => null)];
    const g = gradeDoRealizado(porMes, 10);
    expect(g.receita_bruta![0]).toBe(110_000);
    expect(g.cmv![0]).toBe(44_000);
    // Despesa com estorno maior que o gasto e receita negativa: zero, não negativo.
    expect(g.administrativas![0]).toBe(0);
    expect(g.outras_receitas![0]).toBe(0);
    expect(g.receita_bruta![1]).toBe(0);
    expect(Object.keys(g)).not.toContain("nao_classificado");
  });
});

describe("textoDaCelula", () => {
  it("formata para o campo e zero fica vazio", () => {
    expect(textoDaCelula(123_456)).toBe("1234,56");
    expect(textoDaCelula(5)).toBe("0,05");
    expect(textoDaCelula(0)).toBe("");
  });
});
