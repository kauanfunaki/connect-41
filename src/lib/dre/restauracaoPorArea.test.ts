import { describe, it, expect } from "vitest";
import {
  PREIMAGEM_DO_PADRAO,
  historicoDosRegistros,
  planejarTrocaDeModelo,
  type CategoriaParaTrocar,
  type HistoricoDasCategorias,
} from "./restauracaoPorArea";
import { GRUPO_DO_ANTIGO, MODELO_PADRAO } from "./estrutura";
import { MODELO_POR_AREA } from "./estruturaPorArea";

const cat = (x: Partial<CategoriaParaTrocar> & Pick<CategoriaParaTrocar, "id" | "nome">): CategoriaParaTrocar => ({
  kind: "PAGAR",
  daEmpresa: false,
  dreGroup: null,
  excecao: null,
  ...x,
});

const SEM_HISTORICO: HistoricoDasCategorias = new Map();

describe("os candidatos: o que a migration de 20/10 levou para cada grupo do padrão", () => {
  it("todo grupo antigo é candidato do grupo novo em que a migration o pôs", () => {
    for (const [antigo, novo] of Object.entries(GRUPO_DO_ANTIGO)) expect(PREIMAGEM_DO_PADRAO[novo], antigo).toContain(antigo);
    expect(PREIMAGEM_DO_PADRAO.receita_bruta).toEqual(["receita_bruta"]);
    expect(PREIMAGEM_DO_PADRAO.custo_operacional).toEqual(["cmv", "mao_de_obra", "comerciais"]);
    expect(PREIMAGEM_DO_PADRAO.financiamentos).toEqual(["impostos", "outras_despesas"]);
  });

  it("todo candidato é grupo do modelo por área", () => {
    const grupos = new Set(MODELO_POR_AREA.grupos.map((g) => g.code));
    for (const lista of Object.values(PREIMAGEM_DO_PADRAO)) for (const g of lista) expect(grupos.has(g), g).toBe(true);
  });
});

describe("do padrão para o modelo por área", () => {
  const plano = (categorias: CategoriaParaTrocar[], historico: HistoricoDasCategorias = SEM_HISTORICO) =>
    planejarTrocaDeModelo(categorias, historico, MODELO_PADRAO, MODELO_POR_AREA);

  it("o histórico decide antes do nome", () => {
    // O de-para daquela época diz comerciais; alguém classificou como mão de obra.
    const p = plano([cat({ id: "a", nome: "Aluguel", daEmpresa: true, dreGroup: "custo_operacional" })], new Map([["a", ["mao_de_obra"]]]));
    expect(p.classificacao.a).toBe("mao_de_obra");
    expect(p.porFonte.historico).toBe(1);
    expect(p.gravacoes).toEqual([{ tipo: "categoria", categoryId: "a", grupo: "mao_de_obra" }]);
  });

  it("histórico que não está entre os candidatos não vale — é de outra época", () => {
    // "pessoal" viraria custo administrativo, e a categoria está em custo operacional.
    const p = plano([cat({ id: "a", nome: "Aluguel de veículos", daEmpresa: true, dreGroup: "custo_operacional" })], new Map([["a", ["pessoal"]]]));
    expect(p.classificacao.a).toBe("comerciais");
    expect(p.porFonte).toMatchObject({ historico: 0, de_para: 1 });
  });

  it("o rótulo antigo no histórico também vale", () => {
    const p = plano(
      [cat({ id: "a", nome: "Pedágio", daEmpresa: true, dreGroup: "custo_administrativo" })],
      new Map([["a", ["Despesas Fixas (Diretoria)"]]])
    );
    expect(p.classificacao.a).toBe("diretoria");
  });

  it("categoria da empresa olha o de-para do Omie primeiro; a do escritório, o plano", () => {
    const p = plano([
      cat({ id: "empresa", nome: "Impostos Parcelados", daEmpresa: true, dreGroup: "financiamentos" }),
      cat({ id: "escritorio", nome: "Impostos Parcelados", dreGroup: "financiamentos" }),
    ]);
    // No de-para do Omie era outras despesas; no plano do escritório, impostos.
    expect(p.classificacao.empresa).toBe("outras_despesas");
    expect(p.classificacao.escritorio).toBe("impostos");
    expect(p.porFonte).toMatchObject({ de_para: 1, plano: 1 });
  });

  it("o nome do plano do escritório resolve a mão de obra que virou custo operacional", () => {
    const p = plano([cat({ id: "a", nome: "Abono Salarial pessoal OP", dreGroup: "custo_operacional" })]);
    expect(p.classificacao.a).toBe("mao_de_obra");
    // Do escritório: a classificação desta empresa vira exceção dela.
    expect(p.gravacoes).toEqual([{ tipo: "excecao", categoryId: "a", grupo: "mao_de_obra" }]);
  });

  it("grupo que veio de um antigo só não precisa de evidência, e não grava nada", () => {
    const p = plano([cat({ id: "a", nome: "Vendas", kind: "RECEBER", dreGroup: "receita_bruta" })]);
    expect(p.classificacao.a).toBe("receita_bruta");
    expect(p.porFonte.unico).toBe(1);
    expect(p.gravacoes).toEqual([]);
  });

  it("investimento que virou outras despesas volta pelo nome; sem nome, fica em outras despesas", () => {
    const p = plano([
      cat({ id: "maquina", nome: "Máquinas e Equipamentos", dreGroup: "outras_despesas" }),
      cat({ id: "solta", nome: "Coisa que ninguém conhece", dreGroup: "outras_despesas" }),
    ]);
    expect(p.classificacao.maquina).toBe("investimentos");
    expect(p.classificacao.solta).toBe("outras_despesas");
    expect(p.porFonte).toMatchObject({ de_para: 1, mesmo_codigo: 1 });
    expect(p.gravacoes).toEqual([{ tipo: "excecao", categoryId: "maquina", grupo: "investimentos" }]);
    expect(p.semGrupo).toEqual([]);
  });

  it("sem evidência entre três candidatos, fica sem grupo — vai para Classificar", () => {
    const p = plano([cat({ id: "a", nome: "Coisa que ninguém conhece", dreGroup: "custo_administrativo" })]);
    expect(p.semGrupo).toEqual([{ categoryId: "a", nome: "Coisa que ninguém conhece" }]);
    expect(p.classificacao).toEqual({});
    expect(p.gravacoes).toEqual([]);
  });

  it("a exceção da empresa é refeita como exceção, pelo nome da categoria", () => {
    const p = plano([cat({ id: "a", nome: "Pró-labore", daEmpresa: true, dreGroup: "custo_operacional", excecao: "custo_administrativo" })]);
    expect(p.classificacao.a).toBe("diretoria");
    expect(p.gravacoes).toEqual([{ tipo: "excecao", categoryId: "a", grupo: "diretoria" }]);
  });

  it("o que já está no código ou rótulo do modelo, ou fora do resultado, fica como está", () => {
    const p = plano([
      cat({ id: "a", nome: "X", daEmpresa: true, dreGroup: "cmv" }),
      cat({ id: "b", nome: "Y", dreGroup: "CMV sobre Receita Bruta" }),
      cat({ id: "c", nome: "Z", dreGroup: "custo_operacional", excecao: "transferencia" }),
      cat({ id: "d", nome: "Sem linha", dreGroup: null }),
    ]);
    expect(p.classificacao).toEqual({ a: "cmv", b: "cmv", c: "transferencia" });
    expect(p.gravacoes).toEqual([]);
    expect(p.semGrupo).toEqual([]);
  });
});

describe("do modelo por área de volta para o padrão", () => {
  const plano = (categorias: CategoriaParaTrocar[]) => planejarTrocaDeModelo(categorias, SEM_HISTORICO, MODELO_POR_AREA, MODELO_PADRAO);

  it("a exceção que ficou igual ao plano do escritório sai; a que difere vira o código novo", () => {
    const p = plano([
      cat({ id: "igual", nome: "A", dreGroup: "custo_operacional", excecao: "cmv" }),
      cat({ id: "outra", nome: "B", dreGroup: "custo_operacional", excecao: "pessoal" }),
      cat({ id: "fora", nome: "C", dreGroup: "custo_operacional", excecao: "transferencia" }),
    ]);
    expect(p.gravacoes).toEqual([
      { tipo: "remover_excecao", categoryId: "igual" },
      { tipo: "excecao", categoryId: "outra", grupo: "custo_administrativo" },
    ]);
    expect(p.classificacao).toEqual({ igual: "custo_operacional", outra: "custo_administrativo", fora: "transferencia" });
  });

  it("a categoria da empresa com código antigo ganha o código novo", () => {
    const p = plano([
      cat({ id: "a", nome: "A", daEmpresa: true, dreGroup: "comerciais" }),
      cat({ id: "b", nome: "B", daEmpresa: true, dreGroup: "receita_bruta", kind: "RECEBER" }),
    ]);
    expect(p.gravacoes).toEqual([{ tipo: "categoria", categoryId: "a", grupo: "custo_operacional" }]);
  });

  it("trocar para o mesmo modelo não faz nada", () => {
    const p = planejarTrocaDeModelo([cat({ id: "a", nome: "A", dreGroup: "custo_operacional" })], SEM_HISTORICO, MODELO_PADRAO, MODELO_PADRAO);
    expect(p.gravacoes).toEqual([]);
    expect(p.classificacao).toEqual({});
  });
});

describe("o histórico, a partir da auditoria", () => {
  const EMPRESA = "emp";

  it("lê cada ação que grava a linha da DRE, do mais novo para o mais velho, só desta empresa", () => {
    const h = historicoDosRegistros(
      [
        { action: "dre.modelo", entityId: EMPRESA, metadata: { classificacao: { a: "cmv", b: "pessoal" } } },
        { action: "dre.map", entityId: EMPRESA, metadata: { categoryId: "a", grupo: "mao_de_obra" } },
        { action: "dre.map", entityId: "outra", metadata: { categoryId: "a", grupo: "comerciais" } },
        { action: "financeiro.categoria.linha_da_dre", entityId: "b", metadata: { companyId: EMPRESA, linha: "diretoria" } },
        { action: "financeiro.categoria.linha_da_dre", entityId: "b", metadata: { companyId: "outra", linha: "administrativas" } },
        { action: "financeiro.categoria_da_empresa.criada", entityId: "c", metadata: { companyId: EMPRESA, dreGroup: "cmv" } },
        {
          action: "dre.categoria.linha_corrigida",
          entityId: "d",
          metadata: { linhaDaDre: "Impostos sobre Receita Bruta → CMV sobre Receita Bruta" },
        },
        { action: "dre.categoria.linha_corrigida", entityId: "d", metadata: { companyId: "outra", linhaDaDre: "X → Y" } },
        { action: "financeCategory.update", entityId: "e", metadata: { name: "E", dreGroup: "investimentos" } },
        { action: "financeCategory.create", entityId: "e", metadata: { name: "E", dreGroup: null } },
        { action: "outra.acao", entityId: "a", metadata: { grupo: "cmv" } },
      ],
      EMPRESA
    );
    expect(Object.fromEntries(h)).toEqual({
      a: ["cmv", "mao_de_obra"],
      b: ["pessoal", "diretoria"],
      c: ["cmv"],
      d: ["CMV sobre Receita Bruta"],
      e: ["investimentos"],
    });
  });

  it("metadata torta não quebra a leitura", () => {
    const h = historicoDosRegistros(
      [
        { action: "dre.map", entityId: EMPRESA, metadata: null },
        { action: "dre.modelo", entityId: EMPRESA, metadata: { classificacao: "não é objeto" } },
        { action: "financeiro.categoria.linha_da_dre", entityId: null, metadata: { companyId: EMPRESA, linha: "cmv" } },
      ],
      EMPRESA
    );
    expect(h.size).toBe(0);
  });
});
