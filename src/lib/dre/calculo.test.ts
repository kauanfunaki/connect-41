import { describe, it, expect } from "vitest";
import {
  calcularDre,
  montarMapeamento,
  chaveDaCategoria,
  centavosDaLinha,
  impostoForaDoResultado,
  type LancamentoDoDre,
} from "./calculo";
import { MAPEAMENTO_PADRAO } from "./mapeamento-padrao";
import { OUTUBRO_2025, ESPERADO_OUTUBRO_2025 } from "./outubro-2025.fixture";
import { GRUPOS, LINHAS, NAO_CLASSIFICADO, TRANSFERENCIA, OPCOES_PADRAO } from "./estrutura";

const PADRAO = montarMapeamento(MAPEAMENTO_PADRAO);

function l(categoria: string | null, reais: number, origem: "recebimento" | "pagamento"): LancamentoDoDre {
  return { categoria, valorCentavos: Math.round(reais * 100), origem };
}

// ─────────────────────────────────────────────────────────────────────────────
// O teste que importa: reproduzir o mês que o BPO entregou.
// ─────────────────────────────────────────────────────────────────────────────
describe("outubro de 2025 da Irriga", () => {
  const r = calcularDre(OUTUBRO_2025, PADRAO);

  // ─── Por que a tolerância é de 1 centavo, e só nos subtotais fundos ───────
  //
  // Quinze das dezoito linhas batem ao centavo. As três que não são as mais
  // profundas — gerador de caixa, fluxo após investimentos e fluxo livre — e a
  // diferença é sempre **um centavo**.
  //
  // Não é erro nosso: **a planilha não fecha com ela mesma**. Ela mostra margem
  // de contribuição 241.416,76 e total de despesas fixas −88.485,90, cuja soma
  // é 152.930,86 — e exibe 152.930,85 na linha seguinte. É acúmulo de ponto
  // flutuante no Excel, que carrega a casa escondida e arredonda só na tela.
  //
  // Em centavos inteiros isso não acontece, e é por isso que a conta aqui é
  // inteira. A tolerância existe para o teste falar do que importa — a regra de
  // composição — em vez de travar num centavo que vem da origem.
  const TOLERANCIA_DE_ARREDONDAMENTO = new Set([
    "gerador_de_caixa",
    "fluxo_apos_investimentos",
    "fluxo_de_caixa_livre",
  ]);

  it.each(Object.keys(ESPERADO_OUTUBRO_2025))("a linha %s bate com a planilha", (code) => {
    const nosso = centavosDaLinha(r, code)!;
    const deles = ESPERADO_OUTUBRO_2025[code]!;
    if (TOLERANCIA_DE_ARREDONDAMENTO.has(code)) {
      expect(Math.abs(nosso - deles)).toBeLessThanOrEqual(1);
    } else {
      expect(nosso).toBe(deles);
    }
  });

  // O outro lado da moeda: internamente, a nossa conta fecha exata. É o que a
  // tolerância acima não pode esconder.
  it("os subtotais fecham exatamente entre si, sem centavo perdido", () => {
    const v = (c: string) => centavosDaLinha(r, c)!;
    expect(v("gerador_de_caixa")).toBe(v("margem_contribuicao") + v("total_despesas_fixas"));
    expect(v("fluxo_apos_investimentos")).toBe(v("gerador_de_caixa") + v("investimentos"));
    expect(v("fluxo_de_caixa_livre")).toBe(
      v("fluxo_apos_investimentos") + v("outras_receitas") + v("outras_despesas")
    );
    expect(v("total_despesas_fixas")).toBe(
      v("pessoal") + v("diretoria") + v("administrativas") + v("financeiras")
    );
    expect(v("receita_liquida")).toBe(v("receita_bruta") + v("impostos"));
  });

  // A conferência que a planilha faz à mão, nas abas `Check`: nada entra e
  // some. Aqui é um número que tem de ser zero.
  it("fecha: nada entrou e sumiu", () => {
    expect(r.diferencaDeFechamento).toBe(0);
  });

  // O achado da leitura da planilha: R$ 64.212,71 entraram na conta em outubro
  // e não aparecem em linha nenhuma do relatório, porque o SUMIF não encontra
  // categoria que não está na lista. Aqui elas aparecem, nomeadas.
  it("mostra o que a planilha perdeu, em vez de descartar", () => {
    // 61.802,71 de recebimento indevido, mais as duas transferências que se
    // anulam (+2.410 e −2.410).
    expect(r.porGrupo[NAO_CLASSIFICADO]).toBe(6_180_271);
    const nomes = r.naoClassificado.map((x) => x.categoria);
    expect(nomes).toContain("recebimento indevido");
    expect(nomes).toContain("Entrada de Transferência");
    expect(nomes).toContain("Saída de Transferência");
  });

  it("o maior não classificado vem primeiro", () => {
    expect(r.naoClassificado[0]!.categoria).toBe("recebimento indevido");
    expect(r.naoClassificado[0]!.centavos).toBe(6_180_271);
  });

  // O outro achado: os impostos são calculados e não entram no resultado. Em
  // outubro, R$ 46.148,78 que saíram do caixa e não estão no fluxo livre.
  it("o imposto fica fora do resultado — e o número é dito", () => {
    expect(impostoForaDoResultado(r)).toBe(-4_614_878);

    const somaDosGrupos = GRUPOS.reduce((n, g) => n + (r.porGrupo[g.code] ?? 0), 0);
    const fluxo = centavosDaLinha(r, "fluxo_de_caixa_livre")!;
    expect(fluxo - somaDosGrupos).toBe(4_614_878);
  });

  it("com a margem partindo da líquida, o imposto entra e o fluxo muda", () => {
    const corrigido = calcularDre(OUTUBRO_2025, PADRAO, { margemPartirDaLiquida: true });
    const somaDosGrupos = GRUPOS.reduce((n, g) => n + (corrigido.porGrupo[g.code] ?? 0), 0);
    expect(centavosDaLinha(corrigido, "fluxo_de_caixa_livre")).toBe(somaDosGrupos);
    expect(impostoForaDoResultado(corrigido, { margemPartirDaLiquida: true })).toBe(0);
  });

  // O percentual de mão de obra divide pela líquida, não pela bruta, apesar do
  // rótulo. Reproduzido de propósito — e travado, para a divergência não virar
  // descuido de quem mexer depois.
  it("o % de mão de obra usa a receita líquida, como na planilha", () => {
    const pct = r.linhas.find((x) => x.code === "mao_de_obra_pct")!.fracao!;
    const mo = centavosDaLinha(r, "mao_de_obra")!;
    const liquida = centavosDaLinha(r, "receita_liquida")!;
    const bruta = centavosDaLinha(r, "receita_bruta")!;
    expect(pct).toBeCloseTo(Math.abs(mo / liquida), 6);
    expect(pct).not.toBeCloseTo(Math.abs(mo / bruta), 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("chaveDaCategoria", () => {
  // A planilha casa por texto exato, e a lista dela tem dois espaços em
  // "Comissões  Produção". Cada um desses é um mês em que a linha zera.
  it("normaliza espaço repetido, acento e caixa", () => {
    expect(chaveDaCategoria("Comissões  Produção")).toBe(chaveDaCategoria("comissoes producao"));
    expect(chaveDaCategoria(" Outras Taxas ")).toBe(chaveDaCategoria("outras taxas"));
  });

  // Adivinhar que duas grafias diferentes são a mesma coisa é como um valor vai
  // parar no grupo errado sem deixar rastro.
  it("NÃO corrige erro de digitação", () => {
    expect(chaveDaCategoria("compra de matéria prima - anáisdeaço")).not.toBe(
      chaveDaCategoria("compra de matéria prima - chapa de aço")
    );
  });
});

describe("classificação", () => {
  it("categoria sem de-para vai para o não classificado, com o nome", () => {
    const r = calcularDre([l("Coisa Nova", 500, "pagamento")], PADRAO);
    expect(r.porGrupo[NAO_CLASSIFICADO]).toBe(50_000);
    expect(r.naoClassificado[0]!.categoria).toBe("Coisa Nova");
  });

  it("lançamento sem categoria nenhuma também aparece", () => {
    const r = calcularDre([l(null, -100, "pagamento")], PADRAO);
    expect(r.naoClassificado[0]!.categoria).toBe("(sem categoria)");
    expect(r.diferencaDeFechamento).toBe(0);
  });

  // Somar um recebimento dentro de um grupo de despesa produz número
  // plausível — e plausível é o que ninguém confere.
  it("origem que não bate com a do grupo não entra na conta", () => {
    const mapa = montarMapeamento([{ categoria: "Aluguel", grupo: "administrativas" }]);
    const r = calcularDre([l("Aluguel", 1_000, "recebimento")], mapa);
    expect(r.porGrupo.administrativas).toBe(0);
    expect(r.porGrupo[NAO_CLASSIFICADO]).toBe(100_000);
  });

  // Transferência entre contas próprias não é resultado, mas também não é
  // "ninguém classificou". Ter grupo próprio separa as duas coisas na tela.
  it("transferência tem grupo próprio e não entra em conta nenhuma", () => {
    const mapa = montarMapeamento([
      { categoria: "Entrada de Transferência", grupo: TRANSFERENCIA },
      { categoria: "Saída de Transferência", grupo: TRANSFERENCIA },
    ]);
    const r = calcularDre(
      [l("Entrada de Transferência", 2_410, "recebimento"), l("Saída de Transferência", -2_410, "pagamento")],
      mapa
    );
    expect(r.porGrupo[TRANSFERENCIA]).toBe(0);
    expect(r.porGrupo[NAO_CLASSIFICADO]).toBe(0);
    expect(centavosDaLinha(r, "fluxo_de_caixa_livre")).toBe(0);
    expect(r.diferencaDeFechamento).toBe(0);
  });
});

describe("o relatório", () => {
  it("mês sem lançamento nenhum zera tudo, sem quebrar", () => {
    const r = calcularDre([], PADRAO);
    expect(centavosDaLinha(r, "fluxo_de_caixa_livre")).toBe(0);
    expect(r.diferencaDeFechamento).toBe(0);
  });

  // "Não dá para calcular" não é "zero por cento" — a planilha deixa a célula
  // vazia com IF(x=0,""), e vazio é a leitura certa.
  it("sem receita, o percentual é nulo e não Infinity", () => {
    const r = calcularDre([l("Aluguel", -1_000, "pagamento")], PADRAO);
    for (const linha of r.linhas) {
      if (linha.tipo === "percentual") expect(linha.fracao).toBeNull();
    }
  });

  it("despesa aparece como percentual positivo; resultado mantém o sinal", () => {
    const r = calcularDre(OUTUBRO_2025, PADRAO);
    expect(r.linhas.find((x) => x.code === "cmv_pct")!.fracao!).toBeGreaterThan(0);
    expect(r.linhas.find((x) => x.code === "fluxo_de_caixa_livre_pct")!.fracao!).toBeLessThan(0);
  });

  it("toda linha da estrutura sai no resultado, na ordem", () => {
    const r = calcularDre([], PADRAO);
    expect(r.linhas.map((x) => x.code)).toEqual(LINHAS.map((x) => x.code));
  });

  it("o de-para padrão só aponta para grupos que existem", () => {
    const validos = new Set([...GRUPOS.map((g) => g.code), TRANSFERENCIA]);
    for (const p of MAPEAMENTO_PADRAO) {
      expect(validos.has(p.grupo), `${p.categoria} → ${p.grupo}`).toBe(true);
    }
  });

  it("o de-para padrão não tem categoria repetida", () => {
    const chaves = MAPEAMENTO_PADRAO.map((p) => chaveDaCategoria(p.categoria));
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("a opção padrão é a que reproduz a planilha", () => {
    expect(OPCOES_PADRAO.margemPartirDaLiquida).toBe(false);
  });
});
