import { describe, it, expect } from "vitest";
import { grupoDeTexto, resolverCategorias, contarSemGrupo } from "./mapeamento";
import { GRUPOS, TRANSFERENCIA } from "./estrutura";

describe("grupoDeTexto", () => {
  it("aceita o código do grupo", () => {
    for (const g of GRUPOS) expect(grupoDeTexto(g.code)).toBe(g.code);
  });

  // `dreGroup` é campo livre desde antes deste módulo: um cliente pode já ter
  // o rótulo digitado à mão no plano de contas, e casar por rótulo aproveita
  // esse trabalho em vez de exigir que alguém reescreva doze linhas.
  it("aceita o rótulo, com acento e caixa quaisquer", () => {
    expect(grupoDeTexto("Despesas Fixas (Pessoal)")).toBe("pessoal");
    expect(grupoDeTexto("  despesas   fixas (pessoal)  ")).toBe("pessoal");
    expect(grupoDeTexto("CMV SOBRE RECEITA BRUTA")).toBe("cmv");
  });

  it("reconhece transferência pelos dois nomes", () => {
    expect(grupoDeTexto("transferencia")).toBe(TRANSFERENCIA);
    expect(grupoDeTexto("Transferência entre contas")).toBe(TRANSFERENCIA);
  });

  // Escolher o grupo mais parecido é como um valor sai no relatório como se
  // estivesse certo — e ninguém confere o que parece certo.
  it("texto que não bate devolve nulo, e não o mais parecido", () => {
    expect(grupoDeTexto("Despesas Operacionais")).toBeNull();
    expect(grupoDeTexto("pessoa")).toBeNull();
    expect(grupoDeTexto("")).toBeNull();
    expect(grupoDeTexto(null)).toBeNull();
    expect(grupoDeTexto(undefined)).toBeNull();
  });
});

describe("resolverCategorias", () => {
  const cats = [
    { id: "c1", nome: "Aluguel", dreGroup: "administrativas" },
    { id: "c2", nome: "Frete", dreGroup: "cmv" },
    { id: "c3", nome: "Coisa Nova", dreGroup: null },
  ];

  it("sem exceção, vale o padrão do escritório", () => {
    const r = resolverCategorias(cats, []);
    expect(r.find((c) => c.id === "c1")).toMatchObject({ grupo: "administrativas", origem: "padrao" });
  });

  it("a exceção da empresa ganha do padrão", () => {
    const r = resolverCategorias(cats, [{ categoryId: "c1", grupo: "comerciais" }]);
    expect(r.find((c) => c.id === "c1")).toMatchObject({ grupo: "comerciais", origem: "excecao" });
  });

  // A tela precisa distinguir "o escritório definiu" de "esta empresa foge do
  // padrão" — sem isso, desfazer uma exceção vira adivinhação.
  it("a origem acompanha o grupo", () => {
    const r = resolverCategorias(cats, [{ categoryId: "c2", grupo: "outras_despesas" }]);
    expect(r.map((c) => c.origem)).toEqual(["padrao", "excecao", null]);
  });

  // Exceção apontando para grupo que não existe é erro de dado. Tratá-la como
  // válida faria o valor sumir num grupo que nenhuma linha soma.
  it("exceção inválida cai para o padrão, não para o limbo", () => {
    const r = resolverCategorias(cats, [{ categoryId: "c1", grupo: "grupo_que_nao_existe" }]);
    expect(r.find((c) => c.id === "c1")).toMatchObject({ grupo: "administrativas", origem: "padrao" });
  });

  it("sem padrão e sem exceção, fica sem grupo", () => {
    const r = resolverCategorias(cats, []);
    expect(r.find((c) => c.id === "c3")).toMatchObject({ grupo: null, origem: null });
  });

  it("padrão com texto que não bate também fica sem grupo", () => {
    const r = resolverCategorias([{ id: "x", nome: "X", dreGroup: "Alguma Coisa" }], []);
    expect(r[0]).toMatchObject({ grupo: null, origem: null });
  });

  it("exceção de categoria que não existe é ignorada, sem quebrar", () => {
    const r = resolverCategorias(cats, [{ categoryId: "inexistente", grupo: "cmv" }]);
    expect(r).toHaveLength(3);
  });

  it("conta as que ficaram sem grupo", () => {
    expect(contarSemGrupo(resolverCategorias(cats, []))).toBe(1);
    expect(contarSemGrupo(resolverCategorias(cats, [{ categoryId: "c3", grupo: "cmv" }]))).toBe(0);
  });

  it("lista vazia não quebra", () => {
    expect(resolverCategorias([], [])).toEqual([]);
  });
});
