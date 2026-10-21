import { describe, it, expect } from "vitest";
import { calcularDre, centavosDaLinha, impostoForaDoResultado, montarMapeamento, type LancamentoDoDre } from "./calculo";
import { OUTUBRO_2025, ESPERADO_OUTUBRO_2025 } from "./outubro-2025.fixture";
import { DE_PARA_POR_AREA } from "./deParaPorArea";
import { GRUPOS_POR_AREA, LINHAS_POR_AREA, MODELO_POR_AREA } from "./estruturaPorArea";
import {
  MODELO_PADRAO,
  OPCOES_PADRAO,
  OPCOES_SEM_IMPOSTOS,
  TODOS_OS_GRUPOS,
  ehCodigoDeModelo,
  grupoAceitaOrigem,
  modeloDoCodigo,
  opcoesDaUrl,
  origemDoGrupo,
  rotuloDoGrupo,
} from "./estrutura";
import { grupoDeTexto, resolverCategorias } from "./mapeamento";
import { comRotulosEconomicos, linhaDeResultadoDe, linhaOperacionalDe } from "./economica";
import { calcularIndicadores, compararResultados, resultadoDePorGrupo, simularCenario } from "./analises";
import { responderAoCfo } from "./cfo";
import { dreDoAno } from "./anual";
import { montarDreNoModeloDoBpo, type PlanilhaDoModelo } from "./modeloDoBpo";
import { gradeDeLinhas, gradeVazia, linhasForaDoModelo, porGrupoOrcado } from "./orcamento/grade";
import { grupoDoDeParaDoModelo } from "./categoriasDoImport";
import { itensDosNumerosDaDre } from "@/components/dre/NumerosDaDre";

// O modelo customizado "despesas por área" (21/10/2026): o que foi o padrão até
// 20/10/2026, de volta para a empresa que o usava. A régua é o mês que o BPO
// entregou — outubro de 2025 —, linha a linha, como era antes do PR #246.

const POR_AREA = { ...OPCOES_PADRAO, modelo: MODELO_POR_AREA };
const MAPA = montarMapeamento(DE_PARA_POR_AREA);

function l(categoria: string | null, reais: number, origem: "recebimento" | "pagamento"): LancamentoDoDre {
  return { categoria, valorCentavos: Math.round(reais * 100), origem };
}

describe("outubro de 2025 no modelo por área: a planilha do BPO, linha a linha", () => {
  const r = calcularDre(OUTUBRO_2025, MAPA, POR_AREA);

  // A planilha não fecha com ela mesma no centavo (ponto flutuante do Excel):
  // os três subtotais mais fundos podem diferir em um. A conta aqui é inteira.
  const TOLERANCIA = new Set(["gerador_de_caixa", "fluxo_apos_investimentos", "fluxo_de_caixa_livre"]);

  it.each(Object.keys(ESPERADO_OUTUBRO_2025))("a linha %s bate com a planilha", (code) => {
    const nosso = centavosDaLinha(r, code)!;
    const deles = ESPERADO_OUTUBRO_2025[code]!;
    if (TOLERANCIA.has(code)) expect(Math.abs(nosso - deles)).toBeLessThanOrEqual(1);
    else expect(nosso).toBe(deles);
  });

  it("os subtotais fecham exatamente entre si", () => {
    const v = (c: string) => centavosDaLinha(r, c)!;
    expect(v("margem_contribuicao")).toBe(v("receita_bruta") + v("cmv") + v("mao_de_obra") + v("comerciais"));
    expect(v("total_despesas_fixas")).toBe(v("pessoal") + v("diretoria") + v("administrativas") + v("financeiras"));
    expect(v("gerador_de_caixa")).toBe(v("margem_contribuicao") + v("total_despesas_fixas"));
    expect(v("fluxo_apos_investimentos")).toBe(v("gerador_de_caixa") + v("investimentos"));
    expect(v("fluxo_de_caixa_livre")).toBe(v("fluxo_apos_investimentos") + v("outras_receitas") + v("outras_despesas"));
  });

  it("as linhas são as do modelo, na ordem dele, e o resultado diz o modelo", () => {
    expect(r.linhas.map((x) => x.code)).toEqual(LINHAS_POR_AREA.map((x) => x.code));
    expect(r.modelo).toBe("por_area");
    expect(linhaOperacionalDe(r)).toBe("gerador_de_caixa");
    expect(linhaDeResultadoDe(r)).toBe("fluxo_de_caixa_livre");
  });

  it("os impostos ficam sempre fora do resultado — a opção da tela do padrão não muda nada aqui", () => {
    expect(impostoForaDoResultado(r, POR_AREA)).toBe(-4_614_878);
    const comAOpcao = calcularDre(OUTUBRO_2025, MAPA, { ...OPCOES_SEM_IMPOSTOS, modelo: MODELO_POR_AREA });
    expect(comAOpcao.linhas).toEqual(r.linhas);
    expect(opcoesDaUrl("fora", MODELO_POR_AREA).modelo).toBe(MODELO_POR_AREA);
  });

  it("o % de mão de obra divide pela receita líquida, como na planilha", () => {
    const pct = r.linhas.find((x) => x.code === "mao_de_obra_pct")!.fracao!;
    expect(pct).toBeCloseTo(Math.abs(centavosDaLinha(r, "mao_de_obra")! / centavosDaLinha(r, "receita_liquida")!), 9);
  });
});

describe("o registro dos modelos", () => {
  it("vazio ou desconhecido é o padrão", () => {
    expect(modeloDoCodigo(null)).toBe(MODELO_PADRAO);
    expect(modeloDoCodigo(undefined)).toBe(MODELO_PADRAO);
    expect(modeloDoCodigo("inventado")).toBe(MODELO_PADRAO);
    expect(modeloDoCodigo("por_area")).toBe(MODELO_POR_AREA);
    expect(ehCodigoDeModelo("por_area")).toBe(true);
    expect(ehCodigoDeModelo("inventado")).toBe(false);
  });

  it("um código tem a mesma origem em todo modelo, e a união não repete grupo", () => {
    const codigos = TODOS_OS_GRUPOS.map((g) => g.code);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const g of [...MODELO_PADRAO.grupos, ...GRUPOS_POR_AREA]) expect(origemDoGrupo(g.code), g.code).toBe(g.origem);
    expect(grupoAceitaOrigem("cmv", "pagamento")).toBe(true);
    expect(grupoAceitaOrigem("cmv", "recebimento")).toBe(false);
  });

  it("toda linha de grupo e toda parcela apontam para o que o modelo tem", () => {
    for (const m of [MODELO_PADRAO, MODELO_POR_AREA]) {
      const grupos = new Set(m.grupos.map((g) => g.code));
      const linhas = new Set<string>();
      for (const x of m.linhas) {
        if (x.tipo === "grupo") expect(grupos.has(x.grupo), `${m.codigo}: ${x.code}`).toBe(true);
        if (x.tipo === "subtotal") for (const p of x.parcelas) expect(linhas.has(p), `${m.codigo}: ${x.code} ← ${p}`).toBe(true);
        if (x.tipo === "percentual") expect(linhas.has(x.numerador) && linhas.has(x.denominador), `${m.codigo}: ${x.code}`).toBe(true);
        linhas.add(x.code);
      }
      for (const code of [m.linhaOperacional, m.linhaDoResultado, ...m.analises.comparativo, ...m.analises.principais, ...m.analises.estrutura, ...m.simulador.linhas, ...m.subtotaisDoOrcamento]) {
        expect(linhas.has(code), `${m.codigo}: ${code}`).toBe(true);
      }
      for (const c of m.simulador.campos) for (const g of c.grupos) expect(grupos.has(g), `${m.codigo}: ${g}`).toBe(true);
    }
  });
});

describe("a classificação lida no modelo por área", () => {
  it("aceita o código e o rótulo dos doze grupos, e não adivinha o grupo do padrão", () => {
    expect(grupoDeTexto("cmv", MODELO_POR_AREA)).toBe("cmv");
    expect(grupoDeTexto("CMV sobre Receita Bruta", MODELO_POR_AREA)).toBe("cmv");
    expect(grupoDeTexto("Despesas Fixas (Pessoal)", MODELO_POR_AREA)).toBe("pessoal");
    expect(grupoDeTexto("impostos", MODELO_POR_AREA)).toBe("impostos");
    expect(grupoDeTexto("outras_despesas", MODELO_POR_AREA)).toBe("outras_despesas");
    expect(grupoDeTexto("Transferência entre contas", MODELO_POR_AREA)).toBe("transferencia");
    expect(grupoDeTexto("Desconsiderar no DRE", MODELO_POR_AREA)).toBe("desconsiderar");
    // CMV, mão de obra ou comerciais? Escolher seria inventar.
    expect(grupoDeTexto("custo_operacional", MODELO_POR_AREA)).toBeNull();
    expect(grupoDeTexto("financiamentos", MODELO_POR_AREA)).toBeNull();
    // E o padrão segue traduzindo o código antigo.
    expect(grupoDeTexto("cmv")).toBe("custo_operacional");
  });

  it("a exceção que o modelo não lê cai para o plano, e o plano do padrão sem par fica sem grupo", () => {
    const r = resolverCategorias(
      [
        { id: "a", nome: "Frete", dreGroup: "custo_operacional" },
        { id: "b", nome: "Aluguel", dreGroup: "administrativas" },
        { id: "c", nome: "Vendas", dreGroup: "receita_bruta" },
      ],
      [
        { categoryId: "a", grupo: "cmv" },
        { categoryId: "b", grupo: "custo_administrativo" },
      ],
      MODELO_POR_AREA
    );
    expect(r.map((x) => [x.id, x.grupo, x.origem])).toEqual([
      ["a", "cmv", "excecao"],
      ["b", "administrativas", "padrao"],
      ["c", "receita_bruta", "padrao"],
    ]);
  });

  it("o rótulo do grupo é o do modelo", () => {
    expect(rotuloDoGrupo("cmv", MODELO_POR_AREA)).toBe("CMV sobre Receita Bruta");
    expect(rotuloDoGrupo("cmv")).toBe("Custo Operacional");
  });

  it("a categoria nova do Omie nasce com o grupo do de-para do modelo", () => {
    expect(grupoDoDeParaDoModelo("Frete", MODELO_POR_AREA)).toBe("cmv");
    expect(grupoDoDeParaDoModelo("Frete")).toBe("custo_operacional");
    expect(grupoDoDeParaDoModelo("Coisa que ninguém conhece", MODELO_POR_AREA)).toBeNull();
  });
});

describe("as telas no modelo por área", () => {
  const r = calcularDre(OUTUBRO_2025, MAPA, POR_AREA);

  it("os números do topo dizem o gerador de caixa e o fluxo livre", () => {
    expect(itensDosNumerosDaDre(r, "caixa").map((i) => i.rotulo)).toEqual([
      "Receita bruta",
      "Margem de contribuição",
      "Gerador de caixa operacional",
      "Fluxo de caixa livre",
    ]);
    expect(itensDosNumerosDaDre(r, "competencia").map((i) => i.rotulo)).toEqual([
      "Receita bruta",
      "Margem de contribuição",
      "Resultado operacional",
      "Resultado do período",
    ]);
  });

  it("na competência, as linhas de caixa ganham os nomes de antes", () => {
    const e = comRotulosEconomicos(r);
    expect(e.linhas.find((x) => x.code === "gerador_de_caixa")!.label).toBe("RESULTADO OPERACIONAL");
    expect(e.linhas.find((x) => x.code === "fluxo_apos_investimentos")!.label).toBe("RESULTADO APÓS INVESTIMENTOS");
    expect(e.linhas.find((x) => x.code === "fluxo_de_caixa_livre")!.label).toBe("RESULTADO DO PERÍODO");
  });

  it("o ano monta as linhas do modelo", () => {
    const anual = dreDoAno([{ mes: 10, porGrupo: r.porGrupo, temMovimento: true }], POR_AREA);
    expect(anual.modelo).toBe("por_area");
    expect(anual.colunas[13]!.linhas.map((x) => x.code)).toEqual(LINHAS_POR_AREA.map((x) => x.code));
    expect(anual.colunas[13]!.linhas.find((x) => x.code === "cmv")!.centavos).toBe(ESPERADO_OUTUBRO_2025.cmv);
  });
});

describe("as análises no modelo por área", () => {
  const base = {
    receita_bruta: 100_000,
    impostos: -6_000,
    cmv: -30_000,
    mao_de_obra: -10_000,
    comerciais: -4_000,
    pessoal: -20_000,
    administrativas: -5_000,
    financeiras: -1_000,
    investimentos: -2_000,
  };

  it("a receita arrasta impostos, CMV, mão de obra e comerciais; o fixo e o investimento ficam", () => {
    const s = simularCenario(base, { receita: 10, custoOperacional: 0, custoAdministrativo: 0, financiamentos: 0 }, MODELO_POR_AREA);
    expect(s.receita_bruta).toBe(110_000);
    expect(s.cmv).toBe(-33_000);
    expect(s.mao_de_obra).toBe(-11_000);
    expect(s.impostos).toBe(-6_600);
    expect(s.pessoal).toBe(-20_000);
    expect(s.investimentos).toBe(-2_000);
  });

  it("o CMV soma a própria premissa; as despesas fixas e as financeiras, a delas", () => {
    const s = simularCenario(base, { receita: 10, custoOperacional: 5, custoAdministrativo: 3, financiamentos: -50 }, MODELO_POR_AREA);
    expect(s.cmv).toBe(-34_650);
    expect(s.administrativas).toBe(-5_150);
    expect(s.financeiras).toBe(-500);
    expect(Object.values(s).every(Number.isInteger)).toBe(true);
  });

  it("o comparativo e o peso da estrutura usam as linhas do modelo", () => {
    const atual = resultadoDePorGrupo(base, POR_AREA);
    expect(compararResultados(atual, atual).map((x) => x.code)).toEqual(MODELO_POR_AREA.analises.comparativo);
    const ind = calcularIndicadores({
      economico: atual,
      diasNoMes: 30,
      aReceberEmAberto: 0,
      aReceberVencido: 0,
      aPagarEmAberto: 0,
      variacoesDeCaixa: [],
      maiorClienteEmAberto: 0,
    });
    const peso = ind.find((i) => i.codigo === "peso_despesas_fixas")!;
    expect(peso.formula).toBe("|Total de despesas fixas| / Receita bruta");
    expect(peso.valor).toBeCloseTo(0.26);
  });

  it("o CFO aponta o grupo do modelo que mais piorou", () => {
    const r = responderAoCfo("margem_caiu", {
      competencia: "2026-09",
      atual: resultadoDePorGrupo({ receita_bruta: 100_000, cmv: -50_000, administrativas: -20_000 }, POR_AREA),
      anterior: resultadoDePorGrupo({ receita_bruta: 100_000, cmv: -30_000, administrativas: -20_000 }, POR_AREA),
      reconciliacao: [],
      proximos60: { entradas: 0, saidas: 0 },
      vencidos: { entradas: 0, saidas: 0 },
      aReceber: [],
      aReceberTotal: 0,
    });
    expect(r.causaProvavel).toContain("CMV");
  });
});

describe("o orçamento no modelo por área", () => {
  it("a grade tem os doze grupos, e linha de outro modelo fica de fora e é contada", () => {
    expect(Object.keys(gradeVazia(MODELO_POR_AREA))).toEqual(GRUPOS_POR_AREA.map((g) => g.code));
    const linhas = [
      { groupCode: "cmv", month: 1, centavos: 100 },
      { groupCode: "custo_operacional", month: 1, centavos: 50 },
      { groupCode: "impostos", month: 2, centavos: 7 },
    ];
    const g = gradeDeLinhas(linhas, MODELO_POR_AREA);
    expect(g.cmv![0]).toBe(100);
    expect(g.impostos![1]).toBe(7);
    expect(linhasForaDoModelo(linhas, MODELO_POR_AREA)).toBe(1);
    // No padrão, o código antigo entra no grupo novo — nada fica de fora.
    expect(linhasForaDoModelo(linhas)).toBe(0);
    expect(linhasForaDoModelo([{ groupCode: "inventado", month: 1, centavos: 1 }])).toBe(1);
  });

  it("o orçado passa pelo mesmo motor de linhas do modelo", () => {
    const g = gradeVazia(MODELO_POR_AREA);
    g.receita_bruta![0] = 100_000;
    g.cmv![0] = 30_000;
    g.pessoal![0] = 20_000;
    g.investimentos![0] = 5_000;
    const r = resultadoDePorGrupo(porGrupoOrcado(g, [1], MODELO_POR_AREA), POR_AREA);
    expect(centavosDaLinha(r, "margem_contribuicao")).toBe(70_000);
    expect(centavosDaLinha(r, "gerador_de_caixa")).toBe(50_000);
    expect(centavosDaLinha(r, "fluxo_de_caixa_livre")).toBe(45_000);
  });
});

// A exportação no modelo do BPO volta a ser a de antes de 20/10/2026 para a
// empresa do modelo por área: seis blocos, CMV + mão de obra + comerciais no
// custo operacional, e o EBITDA do arquivo descontando os impostos.
describe("a exportação no modelo do BPO, por área", () => {
  const UM_DE_CADA: LancamentoDoDre[] = [
    l("Clientes - Venda de Mercadoria Fabricadas", 1000, "recebimento"),
    l("Impostos Federais - PIS", -50, "pagamento"),
    l("Frete", -100, "pagamento"), // cmv
    l("Serviços de terceiros", -200, "pagamento"), // mão de obra
    l("Marketing", -50, "pagamento"), // comerciais
    l("FGTS", -40, "pagamento"), // pessoal
    l("Pró-labore", -60, "pagamento"), // diretoria
    l("Contabilidade", -30, "pagamento"), // administrativas
    l("Tarifas Bancárias", -10, "pagamento"), // financeiras
    l("Compra de ativo imobilizado", -80, "pagamento"), // investimentos
    l("Multas", -20, "pagamento"), // outras despesas
    l("Empréstimos Bancários", 30, "recebimento"), // outras receitas
  ];
  const umMes = (opcoes = POR_AREA): PlanilhaDoModelo =>
    montarDreNoModeloDoBpo({ colunas: [{ rotulo: "Out/26", lancamentos: UM_DE_CADA }], mapeamento: MAPA, colunaDeTotal: null, opcoes });
  const p = umMes();
  const linha = (q: PlanilhaDoModelo, codigo: string) => q.linhas.find((x) => x.codigo === codigo)!;

  it("sai na ordem de antes, com os grupos do bloco na ordem do modelo", () => {
    expect(p.linhas.map((x) => x.rotulo)).toEqual([
      "Clientes - Venda de Mercadoria Fabricadas",
      "RECEITA BRUTA",
      "Impostos Federais - PIS",
      "IMPOSTOS SOBRE RECEITA BRUTA",
      "IMPOSTOS SOBRE RECEITA BRUTA %",
      "RECEITA LÍQUIDA",
      "",
      "Frete",
      "Serviços de terceiros",
      "Marketing",
      "CUSTO OPERACIONAL TOTAL",
      "CUSTO OPERACIONAL SOBRE RECEITA BRUTA %",
      "MARGEM DE CONTRIBUIÇÃO",
      "MARGEM DE CONTRIBUIÇÃO SOBRE RECEITA BRUTA %",
      "FGTS",
      "Pró-labore",
      "Contabilidade",
      "Tarifas Bancárias",
      "CUSTO ADMINISTRATIVO TOTAL",
      "CUSTO ADMINISTRATIVO SOBRE RECEITA BRUTA %",
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
  });

  it("as fórmulas e os valores são os de antes — o EBITDA do arquivo desconta os impostos", () => {
    const f = (codigo: string) => linha(p, codigo).celulas[0]!.formula;
    const v = (codigo: string) => linha(p, codigo).celulas[0]!.centavos;
    expect(f("custo_operacional")).toBe("SUM(B10:B12)");
    expect(f("custo_administrativo")).toBe("SUM(B17:B20)");
    expect(f("gerador_de_caixa")).toBe("B4-B6-B13-B21");
    expect(f("outras_despesas")).toBe("SUM(B25:B26)");
    expect(f("resultado_liquido")).toBe("B23-B27+B30");
    expect(v("custo_operacional")).toBe(35000);
    expect(v("custo_administrativo")).toBe(14000);
    expect(v("outras_despesas")).toBe(10000);
    expect(v("gerador_de_caixa")).toBe(46000);
    expect(v("resultado_liquido")).toBe(39000);
  });

  it("a opção dos impostos do padrão não muda o arquivo do por área", () => {
    const q = umMes({ ...OPCOES_SEM_IMPOSTOS, modelo: MODELO_POR_AREA });
    expect(q.linhas).toEqual(p.linhas);
  });

  it("e o arquivo bate com a tela, menos os impostos que só o arquivo desconta", () => {
    const tela = calcularDre(UM_DE_CADA, MAPA, POR_AREA);
    expect(linha(p, "margem_contribuicao").celulas[0]!.centavos).toBe(centavosDaLinha(tela, "margem_contribuicao"));
    expect(linha(p, "gerador_de_caixa").celulas[0]!.centavos).toBe(
      centavosDaLinha(tela, "gerador_de_caixa")! + centavosDaLinha(tela, "impostos")!
    );
  });
});
