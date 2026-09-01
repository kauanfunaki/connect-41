import { describe, expect, it } from "vitest";
import { criaCiclo, montarArvore, PROFUNDIDADE_MAXIMA } from "./companyHierarchy";

const emp = (id: string, parentCompanyId: string | null = null) => ({ id, parentCompanyId });

describe("montarArvore", () => {
  it("pendura a filial na matriz", () => {
    const nos = montarArvore([emp("matriz"), emp("f1", "matriz"), emp("f2", "matriz")]);
    expect(nos).toHaveLength(1);
    expect(nos[0].matriz.id).toBe("matriz");
    expect(nos[0].filiais.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("empresa sem matriz é raiz sem filial", () => {
    const nos = montarArvore([emp("sozinha")]);
    expect(nos).toEqual([{ matriz: emp("sozinha"), filiais: [] }]);
  });

  it("preserva a ordem recebida entre as raízes", () => {
    const nos = montarArvore([emp("b"), emp("a"), emp("f", "b")]);
    expect(nos.map((n) => n.matriz.id)).toEqual(["b", "a"]);
  });

  it("filial cuja matriz não está na página sobe como raiz, em vez de sumir", () => {
    const nos = montarArvore([emp("f1", "matriz-de-outra-pagina")]);
    expect(nos).toHaveLength(1);
    expect(nos[0].matriz.id).toBe("f1");
    expect(nos[0].filiais).toEqual([]);
  });

  it("não perde nenhuma empresa", () => {
    const entrada = [emp("m"), emp("f1", "m"), emp("solta"), emp("orfa", "fora")];
    const nos = montarArvore(entrada);
    const vistas = nos.flatMap((n) => [n.matriz.id, ...n.filiais.map((f) => f.id)]);
    expect(vistas.sort()).toEqual(["f1", "m", "orfa", "solta"]);
  });

  it("lista vazia não gera nó", () => {
    expect(montarArvore([])).toEqual([]);
  });
});

describe("criaCiclo", () => {
  it("apontar para si mesma é ciclo", () => {
    expect(criaCiclo("a", "a", new Map())).toBe(true);
  });

  it("vínculo normal não é ciclo", () => {
    const matrizDe = new Map<string, string | null>([["b", null]]);
    expect(criaCiclo("a", "b", matrizDe)).toBe(false);
  });

  it("pega o anel de dois: A vira filial de B, B já é filial de A", () => {
    const matrizDe = new Map<string, string | null>([["b", "a"]]);
    expect(criaCiclo("a", "b", matrizDe)).toBe(true);
  });

  it("pega o anel indireto, com um nível no meio", () => {
    const matrizDe = new Map<string, string | null>([
      ["c", "b"],
      ["b", "a"],
    ]);
    expect(criaCiclo("a", "c", matrizDe)).toBe(true);
  });

  it("cadeia longa mas legítima passa", () => {
    const matrizDe = new Map<string, string | null>([
      ["m3", "m2"],
      ["m2", "m1"],
      ["m1", null],
    ]);
    expect(criaCiclo("nova", "m3", matrizDe)).toBe(false);
  });

  it("cadeia mais funda que o limite é recusada — anel travaria a listagem", () => {
    const matrizDe = new Map<string, string | null>();
    for (let i = 0; i < PROFUNDIDADE_MAXIMA + 5; i++) matrizDe.set(`n${i}`, `n${i + 1}`);
    expect(criaCiclo("alvo", "n0", matrizDe)).toBe(true);
  });
});
