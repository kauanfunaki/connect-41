import { describe, expect, it } from "vitest";
import { criaCiclo, idsDaPagina, montarArvore, PROFUNDIDADE_MAXIMA } from "./companyHierarchy";

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

describe("idsDaPagina", () => {
  const arvore = (matriz: string, filiais: number) => [
    emp(matriz),
    ...Array.from({ length: filiais }, (_, i) => emp(`${matriz}-f${i}`, matriz)),
  ];

  it("traz a matriz e TODAS as filiais, mesmo passando do tamanho da página", () => {
    const r = idsDaPagina(arvore("bld", 20), 1, 20);
    expect(r.ids).toHaveLength(21);
    expect(r.totalPaginas).toBe(1);
  });

  it("conta matrizes, não linhas — era o bug da BLD", () => {
    // 2 empresas soltas + BLD com 20 filiais = 23 linhas, mas só 3 matrizes.
    const lista = [emp("a"), emp("b"), ...arvore("bld", 20)];
    const r = idsDaPagina(lista, 1, 20);
    expect(r.totalRaizes).toBe(3);
    expect(r.totalPaginas).toBe(1);
    expect(r.ids).toHaveLength(23);
  });

  it("pagina por matriz e nunca parte um grupo entre páginas", () => {
    const lista = [...Array.from({ length: 5 }, (_, i) => emp(`m${i}`)), ...arvore("bld", 3)];
    const p1 = idsDaPagina(lista, 1, 3);
    const p2 = idsDaPagina(lista, 2, 3);
    expect(p1.totalPaginas).toBe(2);
    // A BLD cai inteira na página 2, com as 3 filiais.
    expect(p2.ids).toContain("bld");
    expect(p2.ids.filter((id) => id.startsWith("bld-f"))).toHaveLength(3);
    expect(p1.ids).not.toContain("bld");
  });

  it("filial cujo pai ficou fora do filtro conta como matriz", () => {
    const r = idsDaPagina([emp("f1", "fora-do-filtro")], 1, 20);
    expect(r.totalRaizes).toBe(1);
    expect(r.ids).toEqual(["f1"]);
  });

  it("lista vazia devolve uma página, não zero", () => {
    const r = idsDaPagina([], 1, 20);
    expect(r.totalPaginas).toBe(1);
    expect(r.ids).toEqual([]);
  });
});
