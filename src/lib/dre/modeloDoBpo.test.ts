import { describe, expect, it } from "vitest";
import { calcularDre, centavosDaLinha, montarMapeamento, type LancamentoDoDre } from "./calculo";
import { MAPEAMENTO_PADRAO } from "./mapeamento-padrao";
import { OUTUBRO_2025 } from "./outubro-2025.fixture";
import { DESCONSIDERAR, GRUPOS, NAO_CLASSIFICADO, OPCOES_SEM_IMPOSTOS, TRANSFERENCIA } from "./estrutura";
import {
  BLOCOS_DO_MODELO,
  ROTULO_FORA_DESCONSIDERADA,
  ROTULO_FORA_SEM_GRUPO,
  ROTULO_FORA_TRANSFERENCIA,
  montarDreNoModeloDoBpo,
  nomeDoArquivoDaDre,
  type PlanilhaDoModelo,
} from "./modeloDoBpo";

const PADRAO = montarMapeamento(MAPEAMENTO_PADRAO);

function l(categoria: string | null, reais: number, origem: "recebimento" | "pagamento"): LancamentoDoDre {
  return { categoria, valorCentavos: Math.round(reais * 100), origem };
}

function umMes(lancamentos: LancamentoDoDre[], mapeamento = PADRAO): PlanilhaDoModelo {
  return montarDreNoModeloDoBpo({ colunas: [{ rotulo: "Out/26", lancamentos }], mapeamento, colunaDeTotal: null });
}

function linha(p: PlanilhaDoModelo, codigo: string) {
  const achada = p.linhas.find((x) => x.codigo === codigo);
  if (!achada) throw new Error(`sem a linha ${codigo}`);
  return achada;
}

/** Uma categoria de cada grupo do Connect, com valores redondos. */
const UM_DE_CADA: LancamentoDoDre[] = [
  l("Clientes - Venda de Mercadoria Fabricadas", 1000, "recebimento"),
  l("Impostos Federais - PIS", -50, "pagamento"),
  l("Frete", -100, "pagamento"), // custo operacional
  l("Serviços de terceiros", -200, "pagamento"), // custo operacional
  l("Marketing", -50, "pagamento"), // custo operacional
  l("FGTS", -40, "pagamento"), // custo administrativo
  l("Pró-labore", -60, "pagamento"), // custo administrativo
  l("Contabilidade", -30, "pagamento"), // custo administrativo
  l("Tarifas Bancárias", -10, "pagamento"), // custo administrativo
  l("Impostos Parcelados", -15, "pagamento"), // financiamentos
  l("Compra de ativo imobilizado", -80, "pagamento"), // outras despesas
  l("Multas", -20, "pagamento"), // outras despesas
  l("Empréstimos Bancários", 30, "recebimento"), // outras receitas
];

describe("os blocos do modelo", () => {
  it("todo grupo do Connect cai em exatamente um bloco — grupo novo não some calado", () => {
    for (const g of GRUPOS) {
      expect(BLOCOS_DO_MODELO.filter((b) => b.grupos.includes(g.code)), g.code).toHaveLength(1);
    }
    const conhecidos = new Set(GRUPOS.map((g) => g.code));
    for (const b of BLOCOS_DO_MODELO) for (const g of b.grupos) expect(conhecidos.has(g), g).toBe(true);
  });

  it("sai na ordem do modelo: receita, impostos, custo operacional, administrativo, financiamentos, outras despesas, outras receitas", () => {
    const p = umMes(UM_DE_CADA);
    expect(p.linhas.map((x) => x.rotulo)).toEqual([
      "Clientes - Venda de Mercadoria Fabricadas",
      "RECEITA BRUTA",
      "Impostos Federais - PIS",
      "IMPOSTOS SOBRE RECEITA BRUTA",
      "IMPOSTOS SOBRE RECEITA BRUTA %",
      "RECEITA LÍQUIDA",
      "",
      // Um grupo por bloco: dentro dele, as categorias em ordem alfabética.
      "Frete",
      "Marketing",
      "Serviços de terceiros",
      "CUSTO OPERACIONAL TOTAL",
      "CUSTO OPERACIONAL SOBRE RECEITA BRUTA %",
      "MARGEM DE CONTRIBUIÇÃO",
      "MARGEM DE CONTRIBUIÇÃO SOBRE RECEITA BRUTA %",
      "Contabilidade",
      "FGTS",
      "Pró-labore",
      "Tarifas Bancárias",
      "CUSTO ADMINISTRATIVO TOTAL",
      "CUSTO ADMINISTRATIVO SOBRE RECEITA BRUTA %",
      "Impostos Parcelados",
      "DESPESAS TOTAIS FINANCIAMENTOS, EMPRÉSTIMOS e PARCELAMENTOS",
      "DESPESAS TOTAIS FINANCIAMENTOS, EMPRÉSTIMOS e PARCELAMENTOS %",
      "GERADOR DE CAIXA (EBITDA)",
      "GERADOR DE CAIXA (EBITDA) SOBRE RECEITA LÍQUIDA %",
      "Compra de ativo imobilizado",
      "Multas",
      "OUTRAS DESPESAS TOTAIS",
      "OUTRAS DESPESAS SOBRE RECEITA BRUTA %",
      "Empréstimos Bancários",
      "OUTRAS RECEITAS TOTAIS",
      "OUTRAS RECEITAS SOBRE RECEITA BRUTA %",
      "RESULTADO LÍQUIDO OPERACIONAL",
      "RESULTADO LÍQUIDO OPERACIONAL SOBRE RECEITA BRUTA %",
    ]);
    // Linha 1 é o título e a 2 o cabeçalho; o DRE começa na 3, sem buraco.
    expect(p.linhas.map((x) => x.numero)).toEqual(p.linhas.map((_, i) => i + 3));
    expect(p.linhaDaReceitaBruta).toBe(4);
  });

  it("despesa sai positiva, como o \"Valor Pago\" do modelo; receita fica como está", () => {
    const p = umMes(UM_DE_CADA);
    const cat = (nome: string) => p.linhas.find((x) => x.rotulo === nome)!.celulas[0]!.centavos;
    expect(cat("Frete")).toBe(10000);
    expect(cat("Clientes - Venda de Mercadoria Fabricadas")).toBe(100000);
    expect(cat("Empréstimos Bancários")).toBe(3000);
    expect(p.linhas.find((x) => x.rotulo === "Frete")!.natureza).toBe("despesa");
  });
});

describe("subtotais e percentuais", () => {
  const p = umMes(UM_DE_CADA);
  const v = (codigo: string) => linha(p, codigo).celulas[0]!.centavos;
  const pct = (codigo: string) => linha(p, codigo).celulas[0]!.fracao;
  const f = (codigo: string) => linha(p, codigo).celulas[0]!.formula;

  it("os totais somam as categorias do bloco", () => {
    expect(v("receita_bruta")).toBe(100000);
    expect(v("impostos")).toBe(5000);
    expect(v("custo_operacional")).toBe(35000);
    expect(v("custo_administrativo")).toBe(14000);
    expect(v("financiamentos")).toBe(1500);
    expect(v("outras_despesas")).toBe(10000);
    expect(v("outras_receitas")).toBe(3000);
  });

  it("os resultados fazem a conta do modelo", () => {
    expect(v("receita_liquida")).toBe(95000); // 1000 − 50
    expect(v("margem_contribuicao")).toBe(65000); // 1000 − 350: parte da bruta
    expect(v("gerador_de_caixa")).toBe(44500); // 1000 − 50 − 350 − 140 − 15: o imposto entra, no padrão
    expect(v("resultado_liquido")).toBe(37500); // 445 − 100 + 30
  });

  it("na visão de impostos fora do resultado, o EBITDA não desconta os impostos", () => {
    const q = montarDreNoModeloDoBpo({
      colunas: [{ rotulo: "Out/26", lancamentos: UM_DE_CADA }],
      mapeamento: PADRAO,
      colunaDeTotal: null,
      opcoes: OPCOES_SEM_IMPOSTOS,
    });
    expect(linha(q, "gerador_de_caixa").celulas[0]!.centavos).toBe(49500);
    expect(linha(q, "gerador_de_caixa").celulas[0]!.formula).toBe("B4-B13-B21-B24");
    expect(linha(q, "resultado_liquido").celulas[0]!.centavos).toBe(42500);
    // A receita líquida continua mostrando os impostos.
    expect(linha(q, "receita_liquida").celulas[0]!.centavos).toBe(95000);
  });

  it("as fórmulas são as do modelo, apontando para as linhas certas", () => {
    expect(f("receita_bruta")).toBe("SUM(B3:B3)");
    expect(f("impostos")).toBe("SUM(B5:B5)");
    expect(f("receita_liquida")).toBe("B4-B6");
    expect(f("custo_operacional")).toBe("SUM(B10:B12)");
    expect(f("margem_contribuicao")).toBe("B4-B13");
    expect(f("custo_administrativo")).toBe("SUM(B17:B20)");
    expect(f("financiamentos")).toBe("SUM(B23:B23)");
    // Como o modelo novo (`B7+B16+B53+B93+B107`): o EBITDA desconta os impostos.
    expect(f("gerador_de_caixa")).toBe("B4-B6-B13-B21-B24");
    expect(f("outras_despesas")).toBe("SUM(B28:B29)");
    expect(f("outras_receitas")).toBe("SUM(B32:B32)");
    expect(f("resultado_liquido")).toBe("B26-B30+B33");
    // Categoria é valor, não fórmula — no modelo ela vem do SUMIF da aba do ano.
    expect(p.linhas[0]!.celulas[0]!.formula).toBeNull();
  });

  it("percentual de despesa é ABS sobre a receita bruta; o de resultado é divisão simples", () => {
    expect(pct("impostos_pct")).toBeCloseTo(0.05);
    expect(pct("custo_operacional_pct")).toBeCloseTo(0.35);
    expect(pct("margem_contribuicao_pct")).toBeCloseTo(0.65);
    expect(pct("custo_administrativo_pct")).toBeCloseTo(0.14);
    expect(pct("financiamentos_pct")).toBeCloseTo(0.015);
    expect(pct("gerador_de_caixa_pct")).toBeCloseTo(0.445);
    expect(pct("outras_despesas_pct")).toBeCloseTo(0.1);
    expect(pct("outras_receitas_pct")).toBeCloseTo(0.03);
    expect(pct("resultado_liquido_pct")).toBeCloseTo(0.375);
    expect(f("impostos_pct")).toBe('IF(B4=0,"",ABS(B6/B4))');
    expect(f("margem_contribuicao_pct")).toBe('IF(B4=0,"",B15/B4)');
    // O "sobre receita líquida" do rótulo divide pela bruta, como no modelo.
    expect(f("gerador_de_caixa_pct")).toBe('IF(B4=0,"",B26/B4)');
  });

  it("resultado negativo mantém o sinal no percentual", () => {
    const q = umMes([l("Clientes - Venda de Mercadoria Fabricadas", 100, "recebimento"), l("Frete", -300, "pagamento")]);
    expect(linha(q, "margem_contribuicao").celulas[0]!.centavos).toBe(-20000);
    expect(linha(q, "margem_contribuicao_pct").celulas[0]!.fracao).toBeCloseTo(-2);
    expect(linha(q, "custo_operacional_pct").celulas[0]!.fracao).toBeCloseTo(3);
  });

  it("as casas do percentual seguem o modelo: duas nos impostos e no custo operacional, zero no resto", () => {
    expect(p.linhas.filter((x) => x.casas === 2).map((x) => x.codigo)).toEqual(["impostos_pct", "custo_operacional_pct"]);
  });
});

describe("bate com a tela — outubro de 2025 da Irriga", () => {
  // O mesmo mês que `calculo.test.ts` confere contra a planilha do BPO. Desde
  // 20/10/2026 a tela e o arquivo têm a mesma estrutura: o arquivo diz o mesmo
  // que a tela, linha por linha, nas duas visões dos impostos.
  const r = calcularDre(OUTUBRO_2025, PADRAO);
  const p = umMes(OUTUBRO_2025);
  const tela = (code: string) => centavosDaLinha(r, code)!;
  const arquivo = (codigo: string) => linha(p, codigo).celulas[0]!.centavos!;

  it("receita bruta, impostos e receita líquida", () => {
    expect(arquivo("receita_bruta")).toBe(tela("receita_bruta"));
    expect(arquivo("impostos")).toBe(-tela("impostos"));
    expect(arquivo("receita_liquida")).toBe(tela("receita_liquida"));
  });

  it("custo operacional, margem, custo administrativo e financiamentos", () => {
    expect(arquivo("custo_operacional")).toBe(-tela("custo_operacional"));
    expect(arquivo("margem_contribuicao")).toBe(tela("margem_contribuicao"));
    expect(arquivo("custo_administrativo")).toBe(-tela("custo_administrativo"));
    expect(arquivo("financiamentos")).toBe(-tela("financiamentos"));
  });

  it("o EBITDA e o resultado são os da tela", () => {
    expect(arquivo("gerador_de_caixa")).toBe(tela("ebitda"));
    expect(arquivo("outras_despesas")).toBe(-tela("outras_despesas"));
    expect(arquivo("outras_receitas")).toBe(tela("outras_receitas"));
    expect(arquivo("resultado_liquido")).toBe(tela("resultado_liquido"));
  });

  it("na visão sem impostos, também", () => {
    const rSem = calcularDre(OUTUBRO_2025, PADRAO, OPCOES_SEM_IMPOSTOS);
    const pSem = montarDreNoModeloDoBpo({
      colunas: [{ rotulo: "Out/25", lancamentos: OUTUBRO_2025 }],
      mapeamento: PADRAO,
      colunaDeTotal: null,
      opcoes: OPCOES_SEM_IMPOSTOS,
    });
    expect(linha(pSem, "gerador_de_caixa").celulas[0]!.centavos).toBe(centavosDaLinha(rSem, "ebitda"));
    expect(linha(pSem, "resultado_liquido").celulas[0]!.centavos).toBe(centavosDaLinha(rSem, "resultado_liquido"));
  });

  it("o que a tela deixa sem grupo é o que a conferência marca como fora", () => {
    const fora = p.conferencia.filter((c) => c.destino === ROTULO_FORA_SEM_GRUPO).map((c) => c.categoria);
    expect(new Set(fora)).toEqual(new Set(r.naoClassificado.map((n) => n.categoria)));
    const somaFora = p.conferencia
      .filter((c) => c.fora)
      .reduce((s, c) => s + c.centavos * (c.origem === "pagamento" ? -1 : 1), 0);
    expect(somaFora).toBe(r.porGrupo[NAO_CLASSIFICADO]);
  });
});

describe("empresa sem movimento", () => {
  const p = umMes([]);

  it("sai o esqueleto do modelo, sem categoria, com os totais em zero", () => {
    expect(p.linhas.some((x) => x.tipo === "categoria")).toBe(false);
    expect(p.linhas).toHaveLength(21);
    expect(p.linhaDaReceitaBruta).toBe(3);
    for (const x of p.linhas.filter((y) => y.tipo === "total")) {
      // Zero digitado: SUM de intervalo vazio não existe.
      expect(x.celulas[0]).toEqual({ centavos: 0, fracao: null, formula: null });
    }
    expect(linha(p, "resultado_liquido").celulas[0]!.centavos).toBe(0);
  });

  it("os percentuais ficam vazios — receita zero não é zero por cento", () => {
    for (const x of p.linhas.filter((y) => y.tipo.startsWith("percentual"))) {
      expect(x.celulas[0]!.fracao).toBeNull();
      expect(x.celulas[0]!.formula).toMatch(/^IF\(B3=0,"",/);
    }
  });

  it("a conferência vem vazia e não há aviso", () => {
    expect(p.conferencia).toEqual([]);
    expect(p.temSemGrupo).toBe(false);
  });
});

describe("categoria sem grupo", () => {
  const COM_TRANSFERENCIA = montarMapeamento([
    ...MAPEAMENTO_PADRAO,
    { categoria: "Saída de Transferência", grupo: TRANSFERENCIA },
  ]);
  const p = umMes(
    [
      l("Clientes - Venda de Mercadoria Fabricadas", 1000, "recebimento"),
      l("Categoria Inventada", -70, "pagamento"),
      l(null, -5, "pagamento"),
      // Grupo de recebimento com lançamento de pagamento: de-para errado, fica fora.
      l("Empréstimos Bancários", -20, "pagamento"),
      l("Saída de Transferência", -100, "pagamento"),
    ],
    COM_TRANSFERENCIA
  );

  it("não vira linha do DRE nem mexe em total nenhum", () => {
    const nomes = p.linhas.filter((x) => x.tipo === "categoria").map((x) => x.rotulo);
    expect(nomes).toEqual(["Clientes - Venda de Mercadoria Fabricadas"]);
    expect(linha(p, "outras_receitas").celulas[0]!.centavos).toBe(0);
    expect(linha(p, "resultado_liquido").celulas[0]!.centavos).toBe(100000);
  });

  it("aparece na conferência, primeiro, dizendo por que ficou fora", () => {
    expect(p.conferencia.map((c) => [c.categoria, c.destino, c.centavos])).toEqual([
      ["(sem categoria)", ROTULO_FORA_SEM_GRUPO, 500],
      ["Categoria Inventada", ROTULO_FORA_SEM_GRUPO, 7000],
      ["Empréstimos Bancários", ROTULO_FORA_SEM_GRUPO, 2000],
      ["Saída de Transferência", ROTULO_FORA_TRANSFERENCIA, 10000],
      ["Clientes - Venda de Mercadoria Fabricadas", "RECEITA BRUTA", 100000],
    ]);
    expect(p.temSemGrupo).toBe(true);
  });

  it("transferência sozinha não liga o aviso — ela fica fora de propósito", () => {
    const q = umMes([l("Saída de Transferência", -100, "pagamento")], COM_TRANSFERENCIA);
    expect(q.temSemGrupo).toBe(false);
    expect(q.conferencia[0]!.destino).toBe(ROTULO_FORA_TRANSFERENCIA);
  });

  it("grafias que a tela trata como a mesma categoria viram uma linha só", () => {
    const q = umMes([l("Frete", -10, "pagamento"), l("  FRETE ", -5, "pagamento")]);
    const fretes = q.linhas.filter((x) => x.tipo === "categoria");
    expect(fretes.map((x) => [x.rotulo, x.celulas[0]!.centavos])).toEqual([["Frete", 1500]]);
  });
});

// "Desconsiderar no DRE" (13/10/2026): fora das linhas, como na tela, e na
// conferência com o motivo — quem recebe o arquivo vê que o valor existiu.
describe("categoria desconsiderada", () => {
  const COM_DESCONSIDERADA = montarMapeamento([
    ...MAPEAMENTO_PADRAO,
    { categoria: "Compra de Moldes", grupo: DESCONSIDERAR },
  ]);
  const lancamentos = [
    l("Clientes - Venda de Mercadoria Fabricadas", 1000, "recebimento"),
    l("Frete", -100, "pagamento"),
    l("Compra de Moldes", -300, "pagamento"),
  ];
  const p = umMes(lancamentos, COM_DESCONSIDERADA);
  const semEla = umMes(lancamentos.slice(0, 2), COM_DESCONSIDERADA);

  it("não vira linha nem mexe em total nenhum — a DRE é a mesma de sem ela", () => {
    expect(p.linhas).toEqual(semEla.linhas);
    expect(p.linhas.some((x) => x.rotulo === "Compra de Moldes")).toBe(false);
  });

  it("aparece na conferência como desconsiderada, com o valor no sinal do modelo", () => {
    expect(p.conferencia.map((c) => [c.categoria, c.destino, c.centavos, c.fora])).toEqual([
      ["Compra de Moldes", ROTULO_FORA_DESCONSIDERADA, 30000, true],
      ["Clientes - Venda de Mercadoria Fabricadas", "RECEITA BRUTA", 100000, false],
      ["Frete", "CUSTO OPERACIONAL TOTAL", 10000, false],
    ]);
  });

  it("não liga o aviso de sem grupo — foi tirada de propósito", () => {
    expect(p.temSemGrupo).toBe(false);
  });

  it("bate com a tela: o desconsiderado da conferência é o do cálculo", () => {
    const r = calcularDre(lancamentos, COM_DESCONSIDERADA);
    const naConferencia = p.conferencia.filter((c) => c.destino === ROTULO_FORA_DESCONSIDERADA);
    expect(naConferencia.map((c) => -c.centavos)).toEqual(r.desconsiderado.map((d) => d.centavos));
    expect(r.porGrupo[DESCONSIDERAR]).toBe(-30000);
  });

  it("fica entre a transferência e as linhas da DRE na conferência", () => {
    const q = umMes(
      [l("Categoria Inventada", -1, "pagamento"), l("Compra de Moldes", -2, "pagamento"), l("Saída de Transferência", -3, "pagamento")],
      montarMapeamento([
        { categoria: "Compra de Moldes", grupo: DESCONSIDERAR },
        { categoria: "Saída de Transferência", grupo: TRANSFERENCIA },
      ])
    );
    expect(q.conferencia.map((c) => c.destino)).toEqual([ROTULO_FORA_SEM_GRUPO, ROTULO_FORA_TRANSFERENCIA, ROTULO_FORA_DESCONSIDERADA]);
  });
});

describe("o ano: doze meses e o total", () => {
  const p = montarDreNoModeloDoBpo({
    colunas: [
      { rotulo: "Jan/26", lancamentos: [l("Clientes - Venda de Mercadoria Fabricadas", 100, "recebimento"), l("Frete", -10, "pagamento")] },
      { rotulo: "Fev/26", lancamentos: [l("Clientes - Venda de Mercadoria Fabricadas", 200, "recebimento"), l("Contabilidade", -5, "pagamento")] },
      { rotulo: "Mar/26", lancamentos: [] },
    ],
    mapeamento: PADRAO,
    colunaDeTotal: "Total 2026",
  });

  it("o cabeçalho tem os meses e o total", () => {
    expect(p.cabecalho).toEqual(["Jan/26", "Fev/26", "Mar/26", "Total 2026"]);
    expect(p.temColunaDeTotal).toBe(true);
    for (const x of p.linhas) expect(x.celulas).toHaveLength(4);
  });

  it("categoria sem movimento num mês sai zerada naquele mês", () => {
    const frete = p.linhas.find((x) => x.rotulo === "Frete")!;
    expect(frete.celulas.map((c) => c.centavos)).toEqual([1000, 0, 0, 1000]);
    expect(frete.celulas[3]!.formula).toBe(`SUM(B${frete.numero}:D${frete.numero})`);
  });

  it("o total do ano soma os meses, e o percentual do ano sai dos valores somados", () => {
    expect(linha(p, "receita_bruta").celulas.map((c) => c.centavos)).toEqual([10000, 20000, 0, 30000]);
    expect(linha(p, "receita_bruta").celulas[3]!.formula).toBe("SUM(E3:E3)");
    expect(linha(p, "custo_operacional_pct").celulas[3]!.fracao).toBeCloseTo(10 / 300);
    expect(linha(p, "custo_operacional_pct").celulas[2]!.fracao).toBeNull(); // março sem receita
    expect(linha(p, "resultado_liquido").celulas[3]!.centavos).toBe(30000 - 1000 - 500);
    expect(linha(p, "receita_liquida").celulas[3]!.formula).toBe(
      `E${linha(p, "receita_bruta").numero}-E${linha(p, "impostos").numero}`
    );
  });
});

describe("o nome do arquivo", () => {
  it("leva empresa e período, com acento", () => {
    expect(nomeDoArquivoDaDre("Padaria Pão Quente", "10-2026")).toBe("DRE Padaria Pão Quente 10-2026.xlsx");
    expect(nomeDoArquivoDaDre("Padaria Pão Quente", "2026")).toBe("DRE Padaria Pão Quente 2026.xlsx");
  });

  it("tira o que o Windows não aceita num nome de arquivo", () => {
    expect(nomeDoArquivoDaDre('Comércio A/B: "Matriz"*?', "2026")).toBe("DRE Comércio A B Matriz 2026.xlsx");
    expect(nomeDoArquivoDaDre("   ", "2026")).toBe("DRE empresa 2026.xlsx");
  });
});
