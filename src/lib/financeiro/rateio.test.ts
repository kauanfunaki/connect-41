import { describe, expect, it } from "vitest";
import {
  centavosDosPercentuais,
  lerRateio,
  partesDoRateio,
  repartir,
  resumoDoRateio,
  validarRateio,
  type LinhaDoRateio,
} from "./rateio";

const linha = (categoriaId: string | null, centavos: number, centroId: string | null = null, projetoId: string | null = null): LinhaDoRateio => ({
  categoriaId,
  centroId,
  projetoId,
  centavos,
});

describe("repartir", () => {
  it("fecha o total pelo maior resto, a primeira no empate", () => {
    expect(repartir(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartir(1_000, [60_000, 40_000])).toEqual([600, 400]);
    expect(repartir(1, [50, 50])).toEqual([1, 0]);
    expect(repartir(500, [0, 0])).toEqual([500, 0]);
    expect(repartir(0, [3, 7])).toEqual([0, 0]);
  });

  it("a soma é sempre o total", () => {
    for (const total of [1, 7, 99, 12_345, 1_000_001]) {
      const partes = repartir(total, [3, 5, 7, 11]);
      expect(partes.reduce((s, p) => s + p, 0)).toBe(total);
    }
  });
});

describe("lerRateio", () => {
  it("vazio é sem rateio; JSON de linhas vira linhas", () => {
    expect(lerRateio("")).toEqual({ ok: true, linhas: [] });
    expect(lerRateio('[{"categoriaId":"c1","centroId":"","projetoId":null,"centavos":600},{"categoriaId":"c2","centavos":400}]')).toEqual({
      ok: true,
      linhas: [linha("c1", 600), linha("c2", 400)],
    });
  });

  it("texto que não é lista de linhas é erro, não 'sem rateio'", () => {
    expect(lerRateio("{").ok).toBe(false);
    expect(lerRateio('{"a":1}').ok).toBe(false);
    expect(lerRateio('[{"categoriaId":"c1","centavos":"6,00"}]').ok).toBe(false);
    expect(lerRateio("[1]").ok).toBe(false);
  });
});

describe("validarRateio", () => {
  it("duas linhas com categoria e valor, somando a conta", () => {
    expect(validarRateio([linha("c1", 600), linha("c2", 400)], 1_000)).toEqual({ ok: true });
  });

  it("recusa com o porquê", () => {
    expect(validarRateio([linha("c1", 1_000)], 1_000)).toEqual({ ok: false, erro: "Rateio precisa de ao menos duas linhas." });
    expect(validarRateio([linha("c1", 600), linha(null, 400)], 1_000)).toEqual({ ok: false, erro: "Escolha a categoria da linha 2 do rateio." });
    expect(validarRateio([linha("c1", 1_000), linha("c2", 0)], 1_000)).toEqual({ ok: false, erro: "A linha 2 do rateio está sem valor." });
    const soma = validarRateio([linha("c1", 600), linha("c2", 300)], 1_000);
    expect(soma.ok).toBe(false);
    if (!soma.ok) expect(soma.erro).toMatch(/soma R\$\s?9,00.*de R\$\s?10,00/);
    expect(validarRateio(Array.from({ length: 21 }, () => linha("c", 1)), 21).ok).toBe(false);
  });
});

describe("resumoDoRateio", () => {
  it("a categoria da linha maior; centro e projeto só quando comuns", () => {
    expect(resumoDoRateio([linha("c1", 300, "x", "p"), linha("c2", 700, "x", "p")])).toEqual({ categoriaId: "c2", centroId: "x", projetoId: "p" });
    expect(resumoDoRateio([linha("c1", 500, "x"), linha("c2", 500, "y")])).toEqual({ categoriaId: "c1", centroId: null, projetoId: null });
  });
});

describe("partesDoRateio", () => {
  const linhas = [linha("c1", 600), linha("c2", 300), linha("c3", 100)];

  it("baixa cheia dá o valor de cada linha; parcial, a proporção, fechando o centavo", () => {
    expect(partesDoRateio(1_000, linhas).map((p) => p.centavos)).toEqual([600, 300, 100]);
    expect(partesDoRateio(333, linhas).map((p) => p.centavos)).toEqual([200, 100, 33]);
    expect(partesDoRateio(1, linhas).map((p) => p.centavos)).toEqual([1, 0, 0]);
  });
});

describe("centavosDosPercentuais", () => {
  it("fechando 100%, fecha o total; sem fechar, cada uma a sua fatia", () => {
    expect(centavosDosPercentuais(1_000, [33.33, 33.33, 33.34])).toEqual([333, 333, 334]);
    expect(centavosDosPercentuais(100, [33.33, 33.33, 33.34]).reduce((s, c) => s + c, 0)).toBe(100);
    expect(centavosDosPercentuais(1_000, [60, 30])).toEqual([600, 300]);
  });
});
