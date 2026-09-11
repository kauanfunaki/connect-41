import { describe, it, expect } from "vitest";
import { custoEmCentavos, temPrecoConhecido, somarGasto } from "./custo";

// Cotação fixa nos testes: o câmbio é parâmetro justamente para não entrar aqui.
const COTACAO = 550; // centavos de real por dólar

describe("custoEmCentavos", () => {
  it("calcula entrada e saída com preços diferentes", () => {
    // 1M entrada a $3 + 1M saída a $15 = $18 → 18 * 550 = 9900 centavos
    const c = custoEmCentavos("claude-sonnet-5", { entrada: 1_000_000, saida: 1_000_000 }, COTACAO);
    expect(c).toBe(9_900);
  });

  // A regra central do arquivo. Zero aqui seria um teto que não segura nada.
  it("modelo fora da tabela é desconhecido, nunca zero", () => {
    const c = custoEmCentavos("modelo-que-ninguem-cadastrou", { entrada: 10_000, saida: 10_000 }, COTACAO);
    expect(c).toBeNull();
    expect(c).not.toBe(0);
  });

  // Milhares de chamadas pequenas truncadas para baixo é como o mês fecha
  // abaixo do teto e a fatura vem acima.
  it("arredonda para cima, e chamada mínima nunca custa zero", () => {
    const c = custoEmCentavos("claude-haiku-4-5-20251001", { entrada: 1, saida: 1 }, COTACAO);
    expect(c).toBe(1);
  });

  it("uso zerado custa zero, e isso é conhecido", () => {
    expect(custoEmCentavos("claude-sonnet-5", { entrada: 0, saida: 0 }, COTACAO)).toBe(0);
  });

  it("uso inválido é desconhecido, não zero", () => {
    expect(custoEmCentavos("claude-sonnet-5", { entrada: -1, saida: 0 }, COTACAO)).toBeNull();
    expect(custoEmCentavos("claude-sonnet-5", { entrada: NaN, saida: 0 }, COTACAO)).toBeNull();
  });

  it("temPrecoConhecido responde antes de gastar", () => {
    expect(temPrecoConhecido("claude-opus-5")).toBe(true);
    expect(temPrecoConhecido("gpt-5-turbo-imaginario")).toBe(false);
  });
});

describe("somarGasto", () => {
  it("soma o que sabe e conta à parte o que não sabe", () => {
    const g = somarGasto([{ costCents: 100 }, { costCents: null }, { costCents: 250 }]);
    expect(g.centavos).toBe(350);
    expect(g.chamadas).toBe(3);
    expect(g.semCusto).toBe(1);
  });

  // "R$ 3,50 no mês" com uma chamada sem custo apurado não é R$ 3,50 — é um
  // número que não sabemos, e quem olha precisa poder notar isso.
  it("custo desconhecido não some no total", () => {
    const g = somarGasto([{ costCents: null }, { costCents: null }]);
    expect(g.centavos).toBe(0);
    expect(g.semCusto).toBe(2);
  });

  it("mês sem chamada nenhuma", () => {
    expect(somarGasto([])).toEqual({ centavos: 0, chamadas: 0, semCusto: 0 });
  });
});
