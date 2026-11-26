import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/lib/color";
import { CORES_DA_CAPA, capaDoCartao, corDaCapa, ehCorDaCapa, ehTrocaDeCapa, textoDaTrocaDeCapa } from "./capa";

function contraste(a: string, b: string): number {
  return contrastRatio(relativeLuminance(a)!, relativeLuminance(b)!);
}

describe("CORES_DA_CAPA", () => {
  it("tem as cinco cores que o Societário usa no Trello e mais cinco", () => {
    const chaves = CORES_DA_CAPA.map((c) => c.chave);
    for (const c of ["roxo", "vermelho", "lima", "amarelo", "rosa"]) expect(chaves).toContain(c);
    expect(chaves).toHaveLength(10);
  });

  it("não repete chave nem nome, e a chave cabe na coluna (VARCHAR(20))", () => {
    expect(new Set(CORES_DA_CAPA.map((c) => c.chave)).size).toBe(CORES_DA_CAPA.length);
    expect(new Set(CORES_DA_CAPA.map((c) => c.nome)).size).toBe(CORES_DA_CAPA.length);
    for (const c of CORES_DA_CAPA) expect(c.chave.length).toBeLessThanOrEqual(20);
  });

  it("o texto em cima da faixa passa no AA (4,5:1) — a faixa é a mesma nos dois temas", () => {
    for (const c of CORES_DA_CAPA) expect(contraste(c.fundo, c.tinta), c.chave).toBeGreaterThanOrEqual(4.5);
  });
});

describe("ehCorDaCapa / corDaCapa", () => {
  it("aceita só chave da paleta", () => {
    expect(ehCorDaCapa("roxo")).toBe(true);
    expect(ehCorDaCapa("#6E5DC6")).toBe(false);
    expect(ehCorDaCapa("Roxo")).toBe(false);
    expect(ehCorDaCapa(null)).toBe(false);
  });

  it("chave vazia ou desconhecida = sem cor", () => {
    expect(corDaCapa("vermelho")?.nome).toBe("Vermelho");
    expect(corDaCapa(null)).toBeNull();
    expect(corDaCapa("")).toBeNull();
    expect(corDaCapa("magenta")).toBeNull();
  });
});

describe("capaDoCartao", () => {
  it("a capa do cartão vence a cor do tipo", () => {
    expect(capaDoCartao({ coverColor: "azul", corDoTipo: "roxo" })).toEqual({ cor: corDaCapa("azul"), origem: "cartao" });
  });

  it("sem capa no cartão, vale a cor do tipo", () => {
    expect(capaDoCartao({ coverColor: null, corDoTipo: "roxo" })).toEqual({ cor: corDaCapa("roxo"), origem: "tipo" });
  });

  it("sem processo ligado (hoje), a capa vem só do cartão", () => {
    expect(capaDoCartao({ coverColor: "lima" })?.cor.chave).toBe("lima");
    expect(capaDoCartao({ coverColor: null })).toBeNull();
  });

  it("chave inválida no cartão não esconde a do tipo", () => {
    expect(capaDoCartao({ coverColor: "magenta", corDoTipo: "rosa" })?.origem).toBe("tipo");
    expect(capaDoCartao({ coverColor: "magenta", corDoTipo: "outra" })).toBeNull();
  });
});

describe("histórico da troca", () => {
  it("escreve a cor nova ou a remoção", () => {
    expect(textoDaTrocaDeCapa("amarelo")).toBe("Capa: Amarelo");
    expect(textoDaTrocaDeCapa(null)).toBe("Capa removida");
  });

  it("reconhece a marca no metadata", () => {
    expect(ehTrocaDeCapa({ campo: "capa", de: null, para: "roxo" })).toBe(true);
    expect(ehTrocaDeCapa({ campo: "etiqueta" })).toBe(false);
    expect(ehTrocaDeCapa(null)).toBe(false);
  });
});
