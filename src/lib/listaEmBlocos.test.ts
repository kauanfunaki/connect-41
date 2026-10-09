import { describe, expect, it } from "vitest";
import {
  contagemDoBloco,
  filtrarGrupos,
  gruposAbertosPelaBusca,
  marcarGrupo,
  quantosNoConjunto,
  type Grupo,
} from "./listaEmBlocos";

type Modulo = { code: string; nome: string; descricao: string };

const grupos: Grupo<Modulo>[] = [
  {
    chave: "bpo",
    rotulo: "BPO",
    itens: [
      { code: "bpo_conciliacao", nome: "Conciliação bancária", descricao: "Extrato contra lançamentos" },
      { code: "bpo_cobranca", nome: "Cobrança", descricao: "Régua de cobrança dos clientes" },
    ],
  },
  {
    chave: "dp",
    rotulo: "Departamento Pessoal",
    itens: [
      { code: "dp_ferias", nome: "Férias", descricao: "Períodos aquisitivos e programação" },
      { code: "dp_folha", nome: "Folha", descricao: "Conferência dos lançamentos da folha" },
    ],
  },
  { chave: "soc", rotulo: "Societário", itens: [{ code: "soc_processos", nome: "Processos", descricao: "Abertura e alteração" }] },
];

const nomeEDescricao = (m: Modulo) => [m.nome, m.descricao];
const soNome = (m: Modulo) => [m.nome];
const codigos = (gs: Grupo<Modulo>[]) => gs.map((g) => [g.chave, g.itens.map((i) => i.code)]);

describe("filtrarGrupos", () => {
  it("sem termo devolve tudo como veio", () => {
    expect(filtrarGrupos(grupos, "", soNome)).toBe(grupos);
    expect(filtrarGrupos(grupos, "   ", soNome)).toBe(grupos);
  });

  it("acha sem acento, em qualquer parte do nome, e tira o grupo sem resultado", () => {
    expect(codigos(filtrarGrupos(grupos, "conciliacao", soNome))).toEqual([["bpo", ["bpo_conciliacao"]]]);
    expect(codigos(filtrarGrupos(grupos, "FERIAS", soNome))).toEqual([["dp", ["dp_ferias"]]]);
    expect(codigos(filtrarGrupos(grupos, "banc", soNome))).toEqual([["bpo", ["bpo_conciliacao"]]]);
  });

  it("procura nos textos que a tela mostra — a descrição só quando entra", () => {
    expect(filtrarGrupos(grupos, "lancamentos", soNome)).toEqual([]);
    expect(codigos(filtrarGrupos(grupos, "lancamentos", nomeEDescricao))).toEqual([
      ["bpo", ["bpo_conciliacao"]],
      ["dp", ["dp_folha"]],
    ]);
  });

  it("o nome do grupo traz o grupo inteiro", () => {
    expect(codigos(filtrarGrupos(grupos, "pessoal", soNome))).toEqual([["dp", ["dp_ferias", "dp_folha"]]]);
    expect(codigos(filtrarGrupos(grupos, "societario", soNome))).toEqual([["soc", ["soc_processos"]]]);
  });

  it("não mexe nos grupos recebidos", () => {
    filtrarGrupos(grupos, "cobr", soNome);
    expect(grupos[0].itens).toHaveLength(2);
  });
});

describe("gruposAbertosPelaBusca", () => {
  it("abre os setores com resultado", () => {
    expect([...gruposAbertosPelaBusca(grupos, "o", soNome)]).toEqual(["bpo", "dp", "soc"]);
    expect([...gruposAbertosPelaBusca(grupos, "folha", soNome)]).toEqual(["dp"]);
  });

  it("sem termo, ou sem resultado, fecha tudo", () => {
    expect(gruposAbertosPelaBusca(grupos, "", soNome).size).toBe(0);
    expect(gruposAbertosPelaBusca(grupos, "xyz", soNome).size).toBe(0);
  });
});

describe("marcarGrupo e quantosNoConjunto", () => {
  const dp = ["dp_ferias", "dp_folha"];

  it("marca o grupo todo sem mexer nos outros", () => {
    const antes = new Set(["bpo_cobranca", "dp_ferias"]);
    const depois = marcarGrupo(antes, dp, true);
    expect([...depois].sort()).toEqual(["bpo_cobranca", "dp_ferias", "dp_folha"]);
    expect(quantosNoConjunto(depois, dp)).toBe(2);
  });

  it("desmarca o grupo todo sem mexer nos outros", () => {
    const depois = marcarGrupo(new Set(["bpo_cobranca", "dp_ferias", "dp_folha"]), dp, false);
    expect([...depois]).toEqual(["bpo_cobranca"]);
    expect(quantosNoConjunto(depois, dp)).toBe(0);
  });

  it("devolve um conjunto novo — o de entrada é estado e não muda", () => {
    const antes = new Set(["dp_ferias"]);
    const depois = marcarGrupo(antes, dp, true);
    expect(depois).not.toBe(antes);
    expect([...antes]).toEqual(["dp_ferias"]);
  });

  it("conta só os códigos do grupo", () => {
    expect(quantosNoConjunto(new Set(["bpo_cobranca", "dp_folha"]), dp)).toBe(1);
    expect(quantosNoConjunto(new Set(), dp)).toBe(0);
  });
});

describe("contagemDoBloco", () => {
  const ligados = { um: "ligado", varios: "ligados" };

  it("a palavra concorda com o total", () => {
    expect(contagemDoBloco(6, 9, ligados)).toBe("6 de 9 ligados");
    expect(contagemDoBloco(0, 3, ligados)).toBe("0 de 3 ligados");
    expect(contagemDoBloco(1, 1, ligados)).toBe("1 de 1 ligado");
  });

  it("sem palavra, só os números", () => {
    expect(contagemDoBloco(12, 41)).toBe("12 de 41");
  });
});
