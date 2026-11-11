import { describe, expect, it } from "vitest";
import { cnpj, cpf, criarSorteio, data, gerarTextoDeNumeros, valorEmReais } from "./numeros";
import { NIVEIS } from "./regras";

// O gerador da digitação de números (10/11/2026): repetível pela semente, com
// formatos de um escritório contábil e o tamanho de cada nível.

const FORMATOS = [
  /^R\$$/, // "R$" de "R$ 12.480,35" (o valor vem no item seguinte, depois do espaço)
  /^\d{1,3}(\.\d{3})*,\d{2}$/, // 12.480,35
  /^\d{2}\.\d{3}\.\d{3}\/000[1-9]-\d{2}$/, // CNPJ
  /^\d{3}\.\d{3}\.\d{3}-\d{2}$/, // CPF
  /^\d{2}\/\d{2}\/\d{4}$/, // data
  /^\d{2}\/\d{4}$/, // competência
  /^NF$/, /^\d{6}$/, // NF 004512
  /^[1256]\.\d{3}$/, // CFOP
  /^\d\.\d\.\d{2}\.\d{3}$/, // conta contábil
  /^\d{4}\.\d{2}\.\d{2}$/, // NCM
  /^\d{1,2},\d%$/, // percentual
  /^Lote$/, /^\d{4}\/\d{4}$/, // Lote 2026/0457
];

describe("gerador de números", () => {
  it("a mesma semente dá o mesmo texto; outra semente, outro", () => {
    expect(gerarTextoDeNumeros("medio", 42)).toBe(gerarTextoDeNumeros("medio", 42));
    expect(gerarTextoDeNumeros("medio", 42)).not.toBe(gerarTextoDeNumeros("medio", 43));
  });

  it("todo pedaço do texto tem um formato conhecido, em qualquer nível", () => {
    for (const nivel of NIVEIS) {
      for (let semente = 1; semente <= 60; semente++) {
        for (const pedaco of gerarTextoDeNumeros(nivel, semente).split(" ")) {
          expect(FORMATOS.some((f) => f.test(pedaco)), `${nivel}/${semente}: "${pedaco}"`).toBe(true);
        }
      }
    }
  });

  it("o tamanho cresce com o nível e fica perto da meta", () => {
    const media = (nivel: (typeof NIVEIS)[number]) => {
      let soma = 0;
      for (let s = 1; s <= 50; s++) soma += gerarTextoDeNumeros(nivel, s).length;
      return soma / 50;
    };
    const [f, m, d] = [media("facil"), media("medio"), media("dificil")];
    expect(f).toBeGreaterThanOrEqual(100);
    expect(f).toBeLessThan(m);
    expect(m).toBeLessThan(d);
    expect(d).toBeLessThan(260);
  });

  it("o fácil não tem CNPJ, CPF nem valor de milhar; o difícil tem documento", () => {
    for (let s = 1; s <= 40; s++) {
      const facil = gerarTextoDeNumeros("facil", s);
      expect(facil).not.toMatch(/\/000\d-|\d{3}\.\d{3}\.\d{3}-/);
      expect(facil).not.toMatch(/\d\.\d{3},\d{2}/);
    }
    const dificeis = Array.from({ length: 20 }, (_, s) => gerarTextoDeNumeros("dificil", s + 1)).join(" ");
    expect(dificeis).toMatch(/\d{2}\.\d{3}\.\d{3}\/000\d-\d{2}/);
  });

  it("formatos: reais com milhar, CNPJ e CPF só no formato, data que existe", () => {
    const s = criarSorteio(7);
    for (let i = 0; i < 200; i++) {
      expect(valorEmReais(s, 9_999_999)).toMatch(/^R\$ \d{1,3}(\.\d{3})*,\d{2}$/);
      expect(cnpj(s)).toMatch(/^\d{2}\.\d{3}\.\d{3}\/000[1-9]-\d{2}$/);
      expect(cpf(s)).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
      const [dia, mes, ano] = data(s).split("/").map(Number);
      const d = new Date(Date.UTC(ano, mes - 1, dia));
      expect(d.getUTCDate()).toBe(dia);
      expect(d.getUTCMonth()).toBe(mes - 1);
    }
  });

  it("valor não passa do teto", () => {
    const s = criarSorteio(99);
    for (let i = 0; i < 300; i++) {
      const reais = Number(valorEmReais(s, 999).replace(/^R\$ /, "").split(",")[0].replace(/\./g, ""));
      expect(reais).toBeLessThanOrEqual(999);
    }
  });
});
