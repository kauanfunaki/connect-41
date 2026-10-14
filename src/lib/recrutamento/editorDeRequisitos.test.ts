import { describe, expect, it } from "vitest";
import {
  adicionarRequisito,
  faixasDaRegua,
  mudarRequisito,
  removerRequisito,
  ROTULO_DO_PESO,
  separarEmListas,
  type LinhaDeRequisito,
} from "./editorDeRequisitos";
import { normalizarRequisitos } from "./triagem";

// Gravado intercalado, como uma vaga antiga editada no editor de uma lista só.
const GRAVADO: LinhaDeRequisito[] = [
  { tipo: "OBRIGATORIO", texto: "Turno da madrugada", peso: 3 },
  { tipo: "DESEJAVEL", texto: "Curso de boas práticas", peso: 1 },
  { tipo: "OBRIGATORIO", texto: "Experiência em padaria", peso: 2 },
  { tipo: "DESEJAVEL", texto: "Ensino fundamental", peso: 1 },
];

describe("separarEmListas", () => {
  it("lê a lista gravada em Obrigatórios e Desejáveis, cada item com a posição original", () => {
    const { obrigatorios, desejaveis } = separarEmListas(GRAVADO);
    expect(obrigatorios.map((i) => [i.indice, i.linha.texto])).toEqual([
      [0, "Turno da madrugada"],
      [2, "Experiência em padaria"],
    ]);
    expect(desejaveis.map((i) => [i.indice, i.linha.texto])).toEqual([
      [1, "Curso de boas práticas"],
      [3, "Ensino fundamental"],
    ]);
  });

  it("lista vazia dá duas listas vazias", () => {
    expect(separarEmListas([])).toEqual({ obrigatorios: [], desejaveis: [] });
  });
});

describe("edição sem mexer na ordem gravada", () => {
  it("abrir e salvar sem mexer grava o mesmo — não vira versão nova", () => {
    // `salvarRequisitos` compara o normalizado com o gravado: a ordem tem de voltar igual.
    const antes = normalizarRequisitos({ itens: GRAVADO, corteCompativel: 75, corteParcial: 45 });
    const { obrigatorios, desejaveis } = separarEmListas(GRAVADO);
    expect(obrigatorios.length + desejaveis.length).toBe(GRAVADO.length);
    const depois = normalizarRequisitos({ itens: GRAVADO.map((l) => ({ ...l })), corteCompativel: 75, corteParcial: 45 });
    expect(JSON.stringify(depois)).toBe(JSON.stringify(antes));
  });

  it("adicionar põe no fim, com o tipo da lista e o peso do meio", () => {
    const novo = adicionarRequisito(GRAVADO, "OBRIGATORIO", "  CNH   categoria B ");
    expect(novo).toHaveLength(5);
    expect(novo[4]).toEqual({ tipo: "OBRIGATORIO", texto: "CNH categoria B", peso: 2 });
    expect(separarEmListas(novo).obrigatorios.at(-1)!.indice).toBe(4);
    expect(novo.slice(0, 4)).toEqual(GRAVADO);
  });

  it("texto vazio não entra", () => {
    expect(adicionarRequisito(GRAVADO, "DESEJAVEL", "   ")).toBe(GRAVADO);
  });

  it("trocar o peso e o texto pela posição; remover tira só aquele", () => {
    const comPeso = mudarRequisito(GRAVADO, 2, { peso: 3 });
    expect(comPeso[2]).toEqual({ tipo: "OBRIGATORIO", texto: "Experiência em padaria", peso: 3 });
    expect(comPeso[0]).toBe(GRAVADO[0]);
    const sem = removerRequisito(GRAVADO, 1);
    expect(sem.map((l) => l.texto)).toEqual(["Turno da madrugada", "Experiência em padaria", "Ensino fundamental"]);
  });

  it("o tipo que vai para o servidor é o da lista: obrigatório pesa o dobro na nota", () => {
    const r = normalizarRequisitos({ itens: adicionarRequisito([], "DESEJAVEL", "Excel"), corteCompativel: 75, corteParcial: 45 });
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.itens[0]).toEqual({ id: "r1", tipo: "DESEJAVEL", texto: "Excel", peso: 2 });
  });

  it("o peso tem nome", () => {
    expect([ROTULO_DO_PESO[1], ROTULO_DO_PESO[2], ROTULO_DO_PESO[3]]).toEqual(["baixo", "médio", "alto"]);
  });
});

describe("faixasDaRegua", () => {
  it("as três faixas a partir dos cortes", () => {
    expect(faixasDaRegua("45", "75")).toEqual([
      { faixa: "INCOMPATIVEL", de: 0, ate: 44, legenda: "Incompatível: até 44" },
      { faixa: "PARCIAL", de: 45, ate: 74, legenda: "Parcial: 45 a 74" },
      { faixa: "COMPATIVEL", de: 75, ate: 100, legenda: "Compatível: 75 ou mais" },
    ]);
  });

  it("aceita número e os extremos que o servidor aceita", () => {
    expect(faixasDaRegua(1, 100)!.map((f) => f.legenda)).toEqual(["Incompatível: até 0", "Parcial: 1 a 99", "Compatível: só 100"]);
    expect(faixasDaRegua(74, 75)![1]!.legenda).toBe("Parcial: 74");
  });

  it("corte inválido não desenha régua — a mesma regra do salvar", () => {
    for (const [parcial, compativel] of [
      ["", "75"],
      ["abc", "75"],
      ["75", "75"],
      ["80", "75"],
      ["0", "75"],
      ["45", "101"],
    ]) {
      expect(faixasDaRegua(parcial!, compativel!)).toBeNull();
      expect("erro" in normalizarRequisitos({ itens: GRAVADO, corteParcial: parcial, corteCompativel: compativel })).toBe(true);
    }
  });
});
