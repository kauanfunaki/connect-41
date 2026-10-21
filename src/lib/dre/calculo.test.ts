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
import { OUTUBRO_2025, ESPERADO_OUTUBRO_2025, ESPERADO_OUTUBRO_2025_PADRAO } from "./outubro-2025.fixture";
import {
  GRUPOS,
  LINHAS,
  NAO_CLASSIFICADO,
  TRANSFERENCIA,
  DESCONSIDERAR,
  OPCOES_PADRAO,
  OPCOES_SEM_IMPOSTOS,
  GRUPO_DO_ANTIGO,
  grupoAceitaOrigem,
  grupoAtual,
  opcoesDaUrl,
  parcelasDoEbitda,
  rotuloDoGrupo,
} from "./estrutura";

const PADRAO = montarMapeamento(MAPEAMENTO_PADRAO);

function l(categoria: string | null, reais: number, origem: "recebimento" | "pagamento"): LancamentoDoDre {
  return { categoria, valorCentavos: Math.round(reais * 100), origem };
}

// ─────────────────────────────────────────────────────────────────────────────
// O teste que importa: reproduzir o mês que o BPO entregou.
// ─────────────────────────────────────────────────────────────────────────────
describe("outubro de 2025 da Irriga", () => {
  const r = calcularDre(OUTUBRO_2025, PADRAO);
  const semImpostos = calcularDre(OUTUBRO_2025, PADRAO, OPCOES_SEM_IMPOSTOS);

  // O padrão de 20/10/2026, linha a linha, contra o mês montado à mão a partir
  // da planilha (ver o fixture).
  it.each(Object.keys(ESPERADO_OUTUBRO_2025_PADRAO))("a linha %s bate com o mês montado da planilha", (code) => {
    expect(centavosDaLinha(r, code)).toBe(ESPERADO_OUTUBRO_2025_PADRAO[code]);
  });

  // O cálculo continua o da Irriga: as linhas que as duas estruturas têm em
  // comum batem com a planilha que o BPO entregou.
  it("receita, impostos, receita líquida e margem são os da planilha da Irriga", () => {
    for (const code of ["receita_bruta", "impostos", "receita_liquida", "margem_contribuicao", "outras_receitas"]) {
      expect(centavosDaLinha(r, code), code).toBe(ESPERADO_OUTUBRO_2025[code]);
    }
    const e = ESPERADO_OUTUBRO_2025;
    expect(centavosDaLinha(r, "custo_operacional")).toBe(e.cmv! + e.mao_de_obra! + e.comerciais!);
  });

  // ─── Por que a tolerância é de 1 centavo ──────────────────────────────────
  //
  // **A planilha da Irriga não fecha com ela mesma.** Ela mostra margem de
  // contribuição 241.416,76 e total de despesas fixas −88.485,90, cuja soma é
  // 152.930,86 — e exibe 152.930,85 na linha seguinte. É acúmulo de ponto
  // flutuante no Excel, que carrega a casa escondida e arredonda só na tela.
  // Em centavos inteiros isso não acontece; o centavo vem da origem.
  it("sem os impostos, o resultado é o fluxo de caixa livre da planilha da Irriga", () => {
    const resultado = centavosDaLinha(semImpostos, "resultado_liquido")!;
    expect(Math.abs(resultado - ESPERADO_OUTUBRO_2025.fluxo_de_caixa_livre!)).toBeLessThanOrEqual(1);
    // E o EBITDA é o gerador de caixa dela, menos o que o modelo novo leva para
    // financiamentos (sai das outras despesas) e o IOF (vai para elas).
    const gerador = ESPERADO_OUTUBRO_2025.gerador_de_caixa!;
    const ebitda = centavosDaLinha(semImpostos, "ebitda")!;
    expect(Math.abs(ebitda - (gerador - 1_929_650 + 133_947))).toBeLessThanOrEqual(1);
  });

  // O outro lado da moeda: internamente, a nossa conta fecha exata.
  it("os subtotais fecham exatamente entre si, sem centavo perdido", () => {
    const v = (c: string) => centavosDaLinha(r, c)!;
    expect(v("receita_liquida")).toBe(v("receita_bruta") + v("impostos"));
    expect(v("margem_contribuicao")).toBe(v("receita_bruta") + v("custo_operacional"));
    expect(v("ebitda")).toBe(v("margem_contribuicao") + v("impostos") + v("custo_administrativo") + v("financiamentos"));
    expect(v("resultado_liquido")).toBe(v("ebitda") + v("outras_despesas") + v("outras_receitas"));
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

  // As duas visões dos impostos (20/10/2026). No padrão, o resultado é a soma
  // de todos os grupos: nada que saiu do caixa fica de fora.
  it("no padrão, os impostos descontam do EBITDA e nada fica fora do resultado", () => {
    expect(impostoForaDoResultado(r)).toBe(0);
    const somaDosGrupos = GRUPOS.reduce((n, g) => n + (r.porGrupo[g.code] ?? 0), 0);
    expect(centavosDaLinha(r, "resultado_liquido")).toBe(somaDosGrupos);
  });

  // Na visão "fora do resultado": R$ 46.148,78 que saíram do caixa e não estão
  // no resultado — e o número é dito.
  it("na visão sem impostos, eles ficam fora do resultado — e o número é dito", () => {
    expect(impostoForaDoResultado(semImpostos, OPCOES_SEM_IMPOSTOS)).toBe(-4_614_878);
    const somaDosGrupos = GRUPOS.reduce((n, g) => n + (semImpostos.porGrupo[g.code] ?? 0), 0);
    expect(centavosDaLinha(semImpostos, "resultado_liquido")! - somaDosGrupos).toBe(4_614_878);
  });

  it("as duas visões só diferem nos impostos: receita líquida e margem são as mesmas", () => {
    for (const code of ["receita_bruta", "impostos", "receita_liquida", "custo_operacional", "margem_contribuicao"]) {
      expect(centavosDaLinha(semImpostos, code), code).toBe(centavosDaLinha(r, code));
    }
    expect(centavosDaLinha(semImpostos, "ebitda")! - centavosDaLinha(r, "ebitda")!).toBe(4_614_878);
  });

  // Como as duas planilhas, todo percentual divide pela receita bruta — a da
  // Irriga dividia a mão de obra pela líquida, e isso ficou para trás.
  it("todo percentual divide pela receita bruta: despesa em valor absoluto, resultado com o sinal", () => {
    const bruta = centavosDaLinha(r, "receita_bruta")!;
    for (const linha of r.linhas) {
      if (linha.tipo !== "percentual") continue;
      const numerador = centavosDaLinha(r, linha.code.replace(/_pct$/, ""))!;
      const esperado = ["impostos", "custo_operacional", "custo_administrativo", "financiamentos", "outras_despesas"].some(
        (g) => linha.code === `${g}_pct`
      )
        ? Math.abs(numerador / bruta)
        : numerador / bruta;
      expect(linha.fracao!, linha.code).toBeCloseTo(esperado, 9);
    }
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
    const mapa = montarMapeamento([{ categoria: "Aluguel", grupo: "custo_administrativo" }]);
    const r = calcularDre([l("Aluguel", 1_000, "recebimento")], mapa);
    expect(r.porGrupo.custo_administrativo).toBe(0);
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
    expect(centavosDaLinha(r, "resultado_liquido")).toBe(0);
    expect(r.diferencaDeFechamento).toBe(0);
  });
});

// A linha do relatório abre nas categorias (13/10/2026, teste da Amanda).
describe("o detalhe de cada linha", () => {
  const r = calcularDre(
    [
      l("Clientes - Venda de Mercadoria Fabricadas", 1_000, "recebimento"),
      l("Frete", -100, "pagamento"),
      l("  FRETE ", -50, "pagamento"),
      l("Compra de Matéria Prima - Bobina", -400, "pagamento"),
      l("compra de consumiveis", -10, "pagamento"),
      l("Aluguel de Equipamentos", -20, "pagamento"),
      l("Coisa Nova", -70, "pagamento"),
      { categoria: null, grupo: "outras_despesas", valorCentavos: -30_00, origem: "pagamento", perda: true },
    ],
    PADRAO
  );

  // Alfabética desde 15/10/2026 (era do maior para o menor), sem olhar caixa:
  // "compra", minúsculo, fica entre as do C, e não depois do "Frete".
  it("o grupo abre nas categorias, em ordem alfabética, e a soma é a da linha", () => {
    const operacional = r.porCategoria.custo_operacional!;
    expect(operacional.map((c) => [c.categoria, c.centavos])).toEqual([
      ["Aluguel de Equipamentos", -2_000],
      ["compra de consumiveis", -1_000],
      ["Compra de Matéria Prima - Bobina", -40_000],
      ["Frete", -15_000],
    ]);
    expect(operacional.reduce((s, c) => s + c.centavos, 0)).toBe(centavosDaLinha(r, "custo_operacional"));
  });

  it("o sem grupo e o lançamento de grupo fixo não se confundem com categoria", () => {
    expect(Object.values(r.porCategoria).flat().some((c) => c.categoria === "Coisa Nova")).toBe(false);
    expect(r.porCategoria.outras_despesas).toEqual([{ categoria: "Perda com clientes", centavos: -3_000, origem: "pagamento" }]);
  });
});

// Pedido do Kauan, 13/10/2026: tirar uma categoria do DRE sem fingir que é
// transferência — fora das linhas, fora da fila, e com o valor à mostra.
describe("desconsiderar", () => {
  const mapa = montarMapeamento([
    ...MAPEAMENTO_PADRAO,
    { categoria: "Compra de Moldes", grupo: DESCONSIDERAR },
    { categoria: "Reembolso de sócio", grupo: DESCONSIDERAR },
  ]);
  const lancamentos = [
    l("Clientes - Venda de Mercadoria Fabricadas", 1_000, "recebimento"),
    l("Frete", -100, "pagamento"),
    l("Compra de Moldes", -300, "pagamento"),
    l("  compra de  MOLDES ", -50, "pagamento"),
    l("Reembolso de sócio", 80, "recebimento"),
  ];
  const r = calcularDre(lancamentos, mapa);
  const semElas = calcularDre(lancamentos.filter((x) => !/moldes|reembolso/i.test(x.categoria ?? "")), mapa);

  it("fica fora de todas as linhas: o relatório é o mesmo de sem elas", () => {
    expect(r.linhas).toEqual(semElas.linhas);
  });

  it("não vai para a fila de não classificados", () => {
    expect(r.porGrupo[NAO_CLASSIFICADO]).toBe(0);
    expect(r.naoClassificado).toEqual([]);
  });

  it("o total fica no grupo dele, e a conferência de fechamento segue zerando", () => {
    expect(r.porGrupo[DESCONSIDERAR]).toBe(-35_000 + 8_000);
    expect(r.diferencaDeFechamento).toBe(0);
  });

  // Pelo nome como chegou, como a fila de não classificados: o grupo casa pela
  // chave, a lista mostra o que o arquivo escreveu.
  it("a lista diz quais, por categoria, do maior para o menor", () => {
    expect(r.desconsiderado.map((d) => [d.categoria, d.centavos, d.origem])).toEqual([
      ["Compra de Moldes", -30_000, "pagamento"],
      ["Reembolso de sócio", 8_000, "recebimento"],
      ["compra de  MOLDES", -5_000, "pagamento"],
    ]);
  });

  it("aceita os dois lados — como a transferência, não soma em linha nenhuma", () => {
    expect(grupoAceitaOrigem(DESCONSIDERAR, "pagamento")).toBe(true);
    expect(grupoAceitaOrigem(DESCONSIDERAR, "recebimento")).toBe(true);
    expect(grupoAceitaOrigem("receita_bruta", "pagamento")).toBe(false);
    expect(grupoAceitaOrigem("custo_operacional", "pagamento")).toBe(true);
    expect(grupoAceitaOrigem("inventado", "pagamento")).toBe(false);
  });

  it("tem rótulo próprio, diferente do da transferência", () => {
    expect(rotuloDoGrupo(DESCONSIDERAR)).toBe("Desconsiderar no DRE");
    expect(rotuloDoGrupo(TRANSFERENCIA)).not.toBe(rotuloDoGrupo(DESCONSIDERAR));
  });
});

describe("o relatório", () => {
  it("mês sem lançamento nenhum zera tudo, sem quebrar", () => {
    const r = calcularDre([], PADRAO);
    expect(centavosDaLinha(r, "resultado_liquido")).toBe(0);
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
    expect(r.linhas.find((x) => x.code === "custo_operacional_pct")!.fracao!).toBeGreaterThan(0);
    expect(r.linhas.find((x) => x.code === "resultado_liquido_pct")!.fracao!).toBeLessThan(0);
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

  it("a opção padrão põe os impostos no EBITDA; \"impostos=fora\" no endereço tira", () => {
    expect(OPCOES_PADRAO.impostosNoEbitda).toBe(true);
    expect(opcoesDaUrl(undefined)).toEqual(OPCOES_PADRAO);
    expect(opcoesDaUrl("qualquer")).toEqual(OPCOES_PADRAO);
    expect(opcoesDaUrl("fora")).toEqual(OPCOES_SEM_IMPOSTOS);
    expect(parcelasDoEbitda(OPCOES_PADRAO)).toContain("impostos");
    expect(parcelasDoEbitda(OPCOES_SEM_IMPOSTOS)).not.toContain("impostos");
  });

  it("os sete grupos da estrutura do modelo novo, na ordem dele", () => {
    expect(GRUPOS.map((g) => g.code)).toEqual([
      "receita_bruta",
      "impostos",
      "custo_operacional",
      "custo_administrativo",
      "financiamentos",
      "outras_despesas",
      "outras_receitas",
    ]);
  });
});

// O padrão até 20/10/2026 tinha doze grupos; o código antigo ainda chega por
// orçamento gravado e por dado que a migration não pegou.
describe("os grupos do padrão antigo", () => {
  it("todo código antigo vira um grupo que existe", () => {
    const validos = new Set(GRUPOS.map((g) => g.code));
    for (const [antigo, novo] of Object.entries(GRUPO_DO_ANTIGO)) {
      expect(validos.has(novo), `${antigo} → ${novo}`).toBe(true);
      expect(validos.has(antigo), antigo).toBe(false);
    }
  });

  it("grupoAtual traduz o antigo e deixa o resto como está", () => {
    expect(grupoAtual("cmv")).toBe("custo_operacional");
    expect(grupoAtual("financeiras")).toBe("custo_administrativo");
    expect(grupoAtual("investimentos")).toBe("outras_despesas");
    expect(grupoAtual("impostos")).toBe("impostos");
    expect(grupoAtual(TRANSFERENCIA)).toBe(TRANSFERENCIA);
    expect(grupoAtual("inventado")).toBe("inventado");
  });
});
