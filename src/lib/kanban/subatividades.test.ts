import { describe, expect, it } from "vitest";
import {
  PROFUNDIDADE_MAXIMA,
  aceitaSubatividade,
  ancestrais,
  contarFilhas,
  descendentes,
  montarArvore,
  reposicionar,
} from "./subatividades";

// O exemplo do ClickUp que pediu a mudança: Planilha › Abril › Dia 01 › Manhã.
type Linha = { id: string; parentItemId: string | null; order: number; createdAt: Date; feita?: boolean };
const dia = (n: number) => new Date(`2026-11-0${n}T12:00:00Z`);
const linhas: Linha[] = [
  { id: "manha", parentItemId: "dia01", order: 0, createdAt: dia(4) },
  { id: "planilha", parentItemId: null, order: 0, createdAt: dia(1) },
  { id: "maio", parentItemId: "planilha", order: 1, createdAt: dia(2), feita: true },
  { id: "abril", parentItemId: "planilha", order: 0, createdAt: dia(2) },
  { id: "dia01", parentItemId: "abril", order: 0, createdAt: dia(3) },
  { id: "tarde", parentItemId: "dia01", order: 0, createdAt: dia(5), feita: true },
  { id: "outra", parentItemId: null, order: 1, createdAt: dia(1) },
];

describe("montarArvore", () => {
  it("monta os níveis a partir da lista plana, em qualquer ordem de chegada", () => {
    const [planilha, outra] = montarArvore(linhas);
    expect(planilha.id).toBe("planilha");
    expect(outra.id).toBe("outra");
    const abril = planilha.filhas[0];
    expect(abril.id).toBe("abril");
    expect(abril.filhas[0].id).toBe("dia01");
    expect(abril.filhas[0].filhas.map((n) => n.id)).toEqual(["manha", "tarde"]);
  });

  it("irmãs pela ordem manual e, no empate, pela criação", () => {
    const [planilha] = montarArvore(linhas);
    expect(planilha.filhas.map((n) => n.id)).toEqual(["abril", "maio"]);
    // manha e tarde empatam em order 0: vale quem nasceu antes.
    expect(planilha.filhas[0].filhas[0].filhas.map((n) => n.id)).toEqual(["manha", "tarde"]);
  });

  it("filha de pai que não veio na lista não vira atividade solta", () => {
    const raizes = montarArvore([...linhas, { id: "orfa", parentItemId: "sumiu", order: 0, createdAt: dia(1) }]);
    expect(raizes.map((n) => n.id)).toEqual(["planilha", "outra"]);
  });

  it("aceita a data em texto, como chega no cliente", () => {
    const raizes = montarArvore([
      { id: "b", parentItemId: null, order: 0, createdAt: "2026-11-02T00:00:00Z" },
      { id: "a", parentItemId: null, order: 0, createdAt: "2026-11-01T00:00:00Z" },
    ]);
    expect(raizes.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("contarFilhas — o 0/1 de cada nível", () => {
  it("conta só as filhas diretas; a neta não entra no pai", () => {
    const [planilha] = montarArvore(linhas);
    expect(contarFilhas(planilha, (i) => !!i.feita)).toEqual({ concluidas: 1, total: 2 });
    // Abril tem uma filha (Dia 01), aberta, mesmo com a Tarde concluída lá embaixo.
    expect(contarFilhas(planilha.filhas[0], (i) => !!i.feita)).toEqual({ concluidas: 0, total: 1 });
    expect(contarFilhas(planilha.filhas[0].filhas[0], (i) => !!i.feita)).toEqual({ concluidas: 1, total: 2 });
  });
});

describe("descendentes", () => {
  it("todos os níveis abaixo, de cima para baixo, sem o próprio nó", () => {
    const [planilha] = montarArvore(linhas);
    expect(descendentes(planilha).map((n) => n.id)).toEqual(["abril", "dia01", "manha", "tarde", "maio"]);
    expect(descendentes(planilha.filhas[1])).toEqual([]);
  });
});

describe("ancestrais", () => {
  const porId = new Map(linhas.map((l) => [l.id, l]));

  it("do pai de cima até o imediato", () => {
    expect(ancestrais(porId, "manha").map((l) => l.id)).toEqual(["planilha", "abril", "dia01"]);
    expect(ancestrais(porId, "planilha")).toEqual([]);
  });

  it("dá a profundidade pelo tamanho, e não entra em laço", () => {
    expect(ancestrais(porId, "dia01").length).toBe(2);
    const laco = new Map([
      ["x", { id: "x", parentItemId: "y" }],
      ["y", { id: "y", parentItemId: "x" }],
    ]);
    expect(ancestrais(laco, "x").map((l) => l.id)).toEqual(["y"]);
  });
});

describe("aceitaSubatividade — o limite de profundidade", () => {
  it(`a atividade e os níveis 1 a ${PROFUNDIDADE_MAXIMA - 1} recebem; o ${PROFUNDIDADE_MAXIMA}º não`, () => {
    expect(PROFUNDIDADE_MAXIMA).toBe(5);
    for (let p = 0; p < PROFUNDIDADE_MAXIMA; p++) expect(aceitaSubatividade(p)).toBe(true);
    expect(aceitaSubatividade(PROFUNDIDADE_MAXIMA)).toBe(false);
    expect(aceitaSubatividade(PROFUNDIDADE_MAXIMA + 1)).toBe(false);
  });
});

describe("reposicionar — soltar uma irmã em cima de outra", () => {
  it("descendo, ela fica no lugar do alvo e as do meio sobem", () => {
    expect(reposicionar(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("subindo, ela fica no lugar do alvo e as do meio descem", () => {
    expect(reposicionar(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("sem mudança devolve null", () => {
    expect(reposicionar(["a", "b"], "a", "a")).toBeNull();
    expect(reposicionar(["a", "b"], "a", "z")).toBeNull();
  });
});
