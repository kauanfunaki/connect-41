import { describe, expect, it } from "vitest";
import {
  areaDoCampo,
  cabeNaColuna,
  cabeNasLinhas,
  colocarNaColuna,
  colocarNasLinhas,
  dimensoesDaBase,
  lerConfiguracao,
  medidasDaBase,
  montarTabela,
  moverLinha,
  paramsDaConfiguracao,
  podeTirar,
  tirarDaTabela,
  trocarBase,
  MAXIMO_DE_LINHAS,
  MAXIMO_DE_NIVEIS,
  VISOES_PRONTAS,
  type Fato,
} from "./tabelaDinamica";

const fato = (chave: string, dims: Fato["dims"], valor: number, extra: Fato["medidas"] = {}): Fato => ({ chave, dims, medidas: { valor, ...extra } });

describe("montarTabela", () => {
  const fatos = [
    fato("1", { categoria: "Aluguel", centro: "Loja A", competencia: "2026-09" }, 1_000),
    fato("2", { categoria: "Aluguel", centro: "Loja B", competencia: "2026-10" }, 500),
    // A conta 3 é rateada: duas partes, duas categorias.
    fato("3", { categoria: "Água", centro: "Loja A", competencia: "2026-09" }, 300),
    fato("3", { categoria: "Aluguel", centro: "Loja A", competencia: "2026-09" }, 200),
    fato("4", { categoria: null, competencia: "2026-10" }, 50),
  ];

  it("linhas por categoria, colunas por mês na ordem do tempo, totais que fecham", () => {
    const t = montarTabela(fatos, { linhas: ["categoria"], coluna: "competencia", medida: "valor" });
    expect(t.colunas.map((c) => c.chave)).toEqual(["2026-09", "2026-10"]);
    expect(t.linhas.map((l) => [l.rotulo, l.valores, l.total])).toEqual([
      ["Aluguel", [1_200, 500], 1_700],
      ["Água", [300, 0], 300],
      ["(sem categoria)", [0, 50], 50],
    ]);
    expect(t.totalPorColuna).toEqual([1_500, 550]);
    expect(t.total).toBe(2_050);
  });

  it("dois níveis: subtotais na primeira, o detalhe nas filhas", () => {
    const t = montarTabela(fatos, { linhas: ["centro", "categoria"], coluna: null, medida: "valor" });
    expect(t.colunas).toEqual([{ chave: expect.any(String), rotulo: "Total" }]);
    const lojaA = t.linhas.find((l) => l.rotulo === "Loja A")!;
    expect(lojaA.total).toBe(1_500);
    expect(lojaA.filhas!.map((f) => [f.rotulo, f.total])).toEqual([
      ["Aluguel", 1_200],
      ["Água", 300],
    ]);
  });

  // 16/11/2026 (melhoria-719): as linhas vão até três níveis.
  it("três níveis: cada um dentro do anterior, com subtotais que fecham", () => {
    const t = montarTabela(fatos, { linhas: ["centro", "categoria", "competencia"], coluna: null, medida: "valor" });
    const lojaA = t.linhas.find((l) => l.rotulo === "Loja A")!;
    expect(lojaA.total).toBe(1_500);
    const aluguel = lojaA.filhas!.find((f) => f.rotulo === "Aluguel")!;
    expect(aluguel.total).toBe(1_200);
    expect(aluguel.filhas!.map((n) => [n.chave, n.total])).toEqual([["2026-09", 1_200]]);
    // O último nível não tem filhas, e a soma de cada nível é a linha de cima.
    expect(aluguel.filhas![0]!.filhas).toBeUndefined();
    for (const l of t.linhas) {
      expect(l.filhas!.reduce((s, f) => s + f.total, 0), l.rotulo).toBe(l.total);
      for (const f of l.filhas!) expect(f.filhas!.reduce((s, n) => s + n.total, 0), `${l.rotulo} › ${f.rotulo}`).toBe(f.total);
    }
    expect(t.total).toBe(2_050);
  });

  it("três níveis com coluna: a célula sem fato vale zero em todos os níveis", () => {
    const t = montarTabela(fatos, { linhas: ["centro", "categoria", "competencia"], coluna: "competencia", medida: "valor" });
    expect(t.colunas.map((c) => c.chave)).toEqual(["2026-09", "2026-10"]);
    const lojaB = t.linhas.find((l) => l.rotulo === "Loja B")!;
    expect(lojaB.valores).toEqual([0, 500]);
    expect(lojaB.filhas![0]!.valores).toEqual([0, 500]);
    expect(lojaB.filhas![0]!.filhas![0]!.valores).toEqual([0, 500]);
    expect(t.totalPorColuna).toEqual([1_500, 550]);
  });

  it("três níveis na quantidade: a conta rateada conta uma vez em cada nível", () => {
    const t = montarTabela(fatos, { linhas: ["centro", "competencia", "categoria"], coluna: null, medida: "quantidade" });
    const lojaA = t.linhas.find((l) => l.rotulo === "Loja A")!;
    // Loja A em set/26: as contas 1 e 3; a 3 aparece em Aluguel e em Água.
    expect(lojaA.total).toBe(2);
    expect(lojaA.filhas![0]!.total).toBe(2);
    expect(lojaA.filhas![0]!.filhas!.map((n) => [n.rotulo, n.total])).toEqual([
      ["Aluguel", 2],
      ["Água", 1],
    ]);
  });

  it("a quantidade conta a conta rateada uma vez só, também nos totais", () => {
    const t = montarTabela(fatos, { linhas: ["centro"], coluna: "categoria", medida: "quantidade" });
    const lojaA = t.linhas.find((l) => l.rotulo === "Loja A")!;
    // Na Loja A: conta 1 (Aluguel) e conta 3 (Aluguel e Água) — duas contas, não três.
    expect(lojaA.total).toBe(2);
    expect(t.total).toBe(4);
  });

  it("passa do teto: o resto do primeiro nível vai para Outros", () => {
    const muitos = Array.from({ length: MAXIMO_DE_LINHAS + 5 }, (_, i) => fato(String(i), { contraparte: `F${String(i).padStart(4, "0")}` }, 1 + i));
    const t = montarTabela(muitos, { linhas: ["contraparte"], coluna: null, medida: "valor" });
    expect(t.linhas).toHaveLength(MAXIMO_DE_LINHAS);
    expect(t.linhas.at(-1)!.rotulo).toBe("Outros");
    expect(t.linhasAgrupadas).toBe(6);
    expect(t.total).toBe(muitos.reduce((s, f) => s + f.medidas.valor!, 0));
  });
});

describe("lerConfiguracao", () => {
  const hoje = "2026-10-20";

  it("padrões: contas por categoria e competência, últimos seis meses", () => {
    expect(lerConfiguracao({}, hoje)).toEqual({
      base: "contas",
      linhas: ["categoria"],
      coluna: "competencia",
      medida: "valor",
      filtros: { tipo: "ambos", de: "2026-05", ate: "2026-10", periodoPor: "competencia", situacao: "todas" },
    });
  });

  it("o que não vale na base cai no padrão", () => {
    const c = lerConfiguracao({ base: "baixas", linhas: "situacao,categoria,categoria", coluna: "vencimento", medida: "saldo" }, hoje);
    expect(c.linhas).toEqual(["categoria"]);
    expect(c.coluna).toBeNull();
    expect(c.medida).toBe("valor");
  });

  it("ida e volta pelo endereço", () => {
    const c = lerConfiguracao({ base: "contas", linhas: "contraparte", coluna: "vencimento", medida: "saldo", tipo: "PAGAR", situacao: "abertas", periodo: "todos" }, hoje);
    expect(c.filtros).toMatchObject({ de: null, ate: null, situacao: "abertas", tipo: "PAGAR" });
    const q = Object.fromEntries(paramsDaConfiguracao(c));
    expect(lerConfiguracao(q, hoje)).toEqual(c);
  });

  it("as visões prontas valem na base delas", () => {
    for (const v of VISOES_PRONTAS) {
      const c = lerConfiguracao(v.params, hoje);
      expect(c.linhas.join(","), v.id).toBe(v.params.linhas);
      expect(c.coluna, v.id).toBe(v.params.coluna);
      expect(c.medida, v.id).toBe(v.params.medida);
    }
  });

  // 16/11/2026 (melhoria-719): o terceiro nível é mais um campo no mesmo `linhas`.
  it("as linhas aceitam até três níveis; o quarto fica de fora", () => {
    expect(lerConfiguracao({ linhas: "grupo,categoria,contraparte" }, hoje).linhas).toEqual(["grupo", "categoria", "contraparte"]);
    expect(lerConfiguracao({ linhas: "grupo,categoria,contraparte,centro" }, hoje).linhas).toEqual(["grupo", "categoria", "contraparte"]);
    expect(MAXIMO_DE_NIVEIS).toBe(3);
  });

  it("o link de dois níveis, de antes, lê igual", () => {
    const c = lerConfiguracao({ base: "contas", linhas: "centro,tipo", coluna: "competencia", medida: "valor" }, hoje);
    expect(c.linhas).toEqual(["centro", "tipo"]);
    expect(c.coluna).toBe("competencia");
  });

  it("a coluna que também está nas linhas não vale, em qualquer nível", () => {
    expect(lerConfiguracao({ linhas: "grupo,categoria,competencia", coluna: "competencia" }, hoje).coluna).toBeNull();
  });

  it("ida e volta com três níveis e com o período aberto numa ponta", () => {
    const c = lerConfiguracao({ linhas: "grupo,categoria,contraparte", coluna: "nenhuma", de: "", ate: "2026-08" }, hoje);
    expect(c.filtros).toMatchObject({ de: null, ate: "2026-08" });
    const q = Object.fromEntries(paramsDaConfiguracao(c));
    expect(q.linhas).toBe("grupo,categoria,contraparte");
    // Sem o `de=` vazio, a leitura poria os seis meses do padrão no lugar.
    expect(q.de).toBe("");
    expect(lerConfiguracao(q, hoje)).toEqual(c);

    const desde = lerConfiguracao({ de: "2026-01", ate: "" }, hoje);
    expect(desde.filtros).toMatchObject({ de: "2026-01", ate: null });
    expect(lerConfiguracao(Object.fromEntries(paramsDaConfiguracao(desde)), hoje)).toEqual(desde);
  });

  it("o endereço carrega a empresa e a visão quando há", () => {
    const q = paramsDaConfiguracao(lerConfiguracao({}, hoje), { empresa: "todas", visao: undefined });
    expect(q.get("empresa")).toBe("todas");
    expect(q.has("visao")).toBe(false);
  });
});

// 16/11/2026 (melhoria-719): as regras de colocar, tirar e reordenar um campo
// nas áreas — a tela só desenha o que sai daqui.
describe("campos e áreas", () => {
  const hoje = "2026-11-16";
  const padrao = lerConfiguracao({}, hoje);

  it("os campos e as medidas são os da base", () => {
    expect(dimensoesDaBase("contas")).toContain("vencimento");
    expect(dimensoesDaBase("contas")).not.toContain("pagamento");
    expect(dimensoesDaBase("baixas")).toContain("pagamento");
    expect(dimensoesDaBase("baixas")).not.toContain("situacao");
    expect(medidasDaBase("baixas")).toEqual(["valor", "liquido", "quantidade"]);
    expect(medidasDaBase("contas")).toEqual(["valor", "baixado", "saldo", "quantidade"]);
  });

  it("diz em que área o campo está", () => {
    expect(areaDoCampo(padrao, "categoria")).toBe("linhas");
    expect(areaDoCampo(padrao, "competencia")).toBe("coluna");
    expect(areaDoCampo(padrao, "centro")).toBeNull();
  });

  it("colocar nas linhas: entra como o último nível, até o máximo", () => {
    const dois = colocarNasLinhas(padrao, "centro");
    expect(dois.linhas).toEqual(["categoria", "centro"]);
    const tres = colocarNasLinhas(dois, "projeto");
    expect(tres.linhas).toEqual(["categoria", "centro", "projeto"]);
    expect(cabeNasLinhas(tres, "grupo")).toBe(false);
    // Cheias, ou com o campo já lá, a configuração volta a mesma (a tela nem navega).
    expect(colocarNasLinhas(tres, "grupo")).toBe(tres);
    expect(colocarNasLinhas(dois, "centro")).toBe(dois);
  });

  it("colocar nas linhas o campo da coluna tira-o de lá", () => {
    const c = colocarNasLinhas(padrao, "competencia");
    expect(c.linhas).toEqual(["categoria", "competencia"]);
    expect(c.coluna).toBeNull();
  });

  it("campo de outra base não entra", () => {
    expect(colocarNasLinhas(padrao, "pagamento")).toBe(padrao);
    expect(colocarNaColuna(padrao, "parte")).toBe(padrao);
  });

  it("colocar na coluna: troca o campo que estava lá e sai das linhas", () => {
    expect(colocarNaColuna(padrao, "vencimento")).toMatchObject({ linhas: ["categoria"], coluna: "vencimento" });
    const dois = colocarNasLinhas(padrao, "centro");
    expect(colocarNaColuna(dois, "centro")).toMatchObject({ linhas: ["categoria"], coluna: "centro" });
    expect(colocarNaColuna(padrao, "competencia")).toBe(padrao);
  });

  it("o único campo das linhas só vai para a coluna trocando de lugar com o de lá", () => {
    expect(colocarNaColuna(padrao, "categoria")).toMatchObject({ linhas: ["competencia"], coluna: "categoria" });
    const semColuna = tirarDaTabela(padrao, "competencia");
    expect(semColuna.coluna).toBeNull();
    expect(cabeNaColuna(semColuna, "categoria")).toBe(false);
    expect(colocarNaColuna(semColuna, "categoria")).toBe(semColuna);
  });

  it("tirar: a coluna sai sempre; das linhas, o último campo fica", () => {
    expect(podeTirar(padrao, "categoria")).toBe(false);
    expect(tirarDaTabela(padrao, "categoria")).toBe(padrao);
    const dois = colocarNasLinhas(padrao, "centro");
    expect(tirarDaTabela(dois, "categoria").linhas).toEqual(["centro"]);
    // O que está fora da tabela não tem de onde sair.
    expect(tirarDaTabela(padrao, "projeto")).toBe(padrao);
  });

  it("mover uma linha: sobe e desce um nível, e para na ponta", () => {
    const tres = { ...padrao, linhas: ["grupo", "categoria", "contraparte"] as typeof padrao.linhas };
    expect(moverLinha(tres, "contraparte", -1).linhas).toEqual(["grupo", "contraparte", "categoria"]);
    expect(moverLinha(tres, "grupo", 1).linhas).toEqual(["categoria", "grupo", "contraparte"]);
    expect(moverLinha(tres, "grupo", -1)).toBe(tres);
    expect(moverLinha(tres, "contraparte", 1)).toBe(tres);
    expect(moverLinha(tres, "centro", 1)).toBe(tres);
  });

  it("trocar a base: o que não existe nela volta ao padrão", () => {
    const contas = lerConfiguracao({ linhas: "situacao,categoria", coluna: "vencimento", medida: "saldo", situacao: "abertas", periodoPor: "vencimento", tipo: "PAGAR" }, hoje);
    const baixas = trocarBase(contas, "baixas");
    expect(baixas).toMatchObject({ base: "baixas", linhas: ["categoria"], coluna: "pagamento", medida: "valor" });
    // O tipo e o período ficam; os filtros que só as contas têm voltam ao começo.
    expect(baixas.filtros).toEqual({ ...contas.filtros, situacao: "todas", periodoPor: "competencia" });
    // É o que o servidor lê de volta do endereço: a tela adianta o mesmo desenho.
    expect(lerConfiguracao(Object.fromEntries(paramsDaConfiguracao(baixas)), hoje)).toEqual(baixas);
    expect(trocarBase(contas, "contas")).toBe(contas);
  });

  it("trocar a base sem campo que valha nas linhas cai na categoria", () => {
    const contas = lerConfiguracao({ linhas: "situacao,aprovacao", coluna: "categoria" }, hoje);
    // A categoria foi para as linhas: não pode ficar também na coluna.
    expect(trocarBase(contas, "baixas")).toMatchObject({ linhas: ["categoria"], coluna: null });
    const baixas = lerConfiguracao({ base: "baixas", linhas: "parte", coluna: "pagamento", medida: "liquido" }, hoje);
    expect(trocarBase(baixas, "contas")).toMatchObject({ linhas: ["categoria"], coluna: "competencia", medida: "valor" });
  });

  it("toda mudança das áreas sobrevive à ida e volta pelo endereço", () => {
    const passos = [
      colocarNasLinhas(padrao, "centro"),
      colocarNaColuna(padrao, "vencimento"),
      tirarDaTabela(padrao, "competencia"),
      moverLinha(colocarNasLinhas(colocarNasLinhas(padrao, "centro"), "projeto"), "projeto", -1),
      trocarBase(padrao, "baixas"),
    ];
    for (const c of passos) expect(lerConfiguracao(Object.fromEntries(paramsDaConfiguracao(c)), hoje)).toEqual(c);
  });
});
