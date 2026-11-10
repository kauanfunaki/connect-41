import { describe, expect, it } from "vitest";
import { confirmacaoDaExclusaoDaTarefa, contarArvoreDaTarefa, oQueVaiJuntoDaTarefa } from "./exclusaoDeTarefa";

describe("contarArvoreDaTarefa", () => {
  it("atividades são as de cima; subatividades, todos os níveis abaixo", () => {
    // raiz → a, b; a → a1; a1 → a11; e a solta.
    const itens = [
      { parentItemId: null }, { parentItemId: "raiz" }, { parentItemId: "raiz" },
      { parentItemId: "a" }, { parentItemId: "a1" }, { parentItemId: null },
    ];
    expect(contarArvoreDaTarefa(itens)).toEqual({ atividades: 2, subatividades: 4 });
  });

  it("tarefa vazia", () => {
    expect(contarArvoreDaTarefa([])).toEqual({ atividades: 0, subatividades: 0 });
  });
});

describe("oQueVaiJuntoDaTarefa — os números na confirmação", () => {
  it.each([
    [1, 0, "Vai junto a atividade desta tarefa, com os comentários, os anexos e o histórico."],
    [1, 1, "Vão junto a atividade desta tarefa e a subatividade dentro dela, com os comentários, os anexos e o histórico."],
    [1, 3, "Vão junto a atividade desta tarefa e as 3 subatividades dentro dela, de todos os níveis, com os comentários, os anexos e o histórico."],
    [12, 0, "Vão junto as 12 atividades desta tarefa, com os comentários, os anexos e o histórico."],
    [12, 1, "Vão junto as 12 atividades desta tarefa e a subatividade dentro delas, com os comentários, os anexos e o histórico."],
    [1204, 30, "Vão junto as 1.204 atividades desta tarefa e as 30 subatividades dentro delas, de todos os níveis, com os comentários, os anexos e o histórico."],
  ])("%i atividade(s) e %i subatividade(s)", (atividades, subatividades, frase) => {
    expect(oQueVaiJuntoDaTarefa({ atividades, subatividades })).toBe(frase);
  });
});

describe("confirmacaoDaExclusaoDaTarefa", () => {
  it("com conteúdo, a janela forte com o nome da tarefa e os números", () => {
    expect(confirmacaoDaExclusaoDaTarefa("Conciliações", { atividades: 2, subatividades: 4 })).toEqual({
      titulo: 'Excluir a tarefa "Conciliações" com tudo o que tem dentro?',
      descricao: "Vão junto as 2 atividades desta tarefa e as 4 subatividades dentro delas, de todos os níveis, com os comentários, os anexos e o histórico.",
      rotuloDoBotao: "Excluir tarefa e atividades",
    });
  });

  it("vazia, fica a confirmação simples", () => {
    expect(confirmacaoDaExclusaoDaTarefa("Conciliações", { atividades: 0, subatividades: 0 })).toBeNull();
  });
});
