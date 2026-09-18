import { describe, expect, it } from "vitest";
import { avisoDeContasAPagar, avisoDePendenciasVencidas, avisoDeOrcamento, maiorEstouro } from "./alertas";

/** O `Intl` separa "R$" do número com espaço inquebrável; aqui se lê como espaço. */
function texto(valor: string | null): string {
  return (valor ?? "").replace(/ /g, " ");
}

describe("avisoDeContasAPagar", () => {
  it("dia calmo não vira aviso", () => {
    expect(avisoDeContasAPagar({ venceHoje: 0, totalHoje: 0, venceramOntem: 0, totalOntem: 0 })).toBeNull();
  });

  it("junta o que vence hoje e o que venceu ontem, com valor", () => {
    const aviso = texto(avisoDeContasAPagar({ venceHoje: 3, totalHoje: 1_250_00, venceramOntem: 1, totalOntem: 300_00 }));
    expect(aviso).toContain("3 contas a pagar vencem hoje");
    expect(aviso).toContain("R$ 1.250,00");
    expect(aviso).toContain("1 venceu ontem");
  });

  it("uma conta fala no singular", () => {
    expect(texto(avisoDeContasAPagar({ venceHoje: 1, totalHoje: 90_00, venceramOntem: 0, totalOntem: 0 }))).toBe(
      "1 conta a pagar vence hoje (R$ 90,00)."
    );
  });
});

describe("avisoDePendenciasVencidas", () => {
  it("conta no singular e no plural, e some com zero", () => {
    expect(avisoDePendenciasVencidas(0)).toBeNull();
    expect(avisoDePendenciasVencidas(1)).toContain("1 pendência sua venceu");
    expect(avisoDePendenciasVencidas(4)).toContain("4 pendências suas venceram");
  });
});

describe("maiorEstouro", () => {
  // Despesa vem negativa da DRE, nos dois lados: gastar 12.000 contra 10.000
  // orçados é −12.000 contra −10.000.
  const orcado = { pessoal: -10_000_00, administrativas: -5_000_00, receita_bruta: 50_000_00 };

  it("acha o grupo que mais passou, em magnitude de gasto", () => {
    const realizado = { pessoal: -12_000_00, administrativas: -5_500_00, receita_bruta: 40_000_00 };
    expect(maiorEstouro(realizado, orcado)).toMatchObject({
      grupo: "pessoal",
      orcado: 10_000_00,
      realizado: 12_000_00,
      excedente: 2_000_00,
    });
  });

  it("gastar menos que o orçado não é estouro", () => {
    expect(maiorEstouro({ pessoal: -9_000_00, administrativas: -1_00 }, orcado)).toBeNull();
  });

  // Receita abaixo do orçado é problema de outra conversa: o alerta é de gasto.
  it("receita fora do orçado não entra", () => {
    expect(maiorEstouro({ receita_bruta: 10_000_00 }, orcado)).toBeNull();
  });

  it("grupo sem orçado não estoura, e o mínimo corta o troco", () => {
    expect(maiorEstouro({ investimentos: -900_00 }, orcado)).toBeNull();
    expect(maiorEstouro({ pessoal: -10_000_50 }, orcado, 100_00)).toBeNull();
    expect(maiorEstouro({ pessoal: -10_200_00 }, orcado, 100_00)?.excedente).toBe(200_00);
  });
});

describe("avisoDeOrcamento", () => {
  it("diz empresa, grupo, competência e os dois números", () => {
    const aviso = texto(avisoDeOrcamento("BLD Logística", "2026-09", {
      grupo: "pessoal",
      rotulo: "Despesas Fixas (Pessoal)",
      orcado: 10_000_00,
      realizado: 12_000_00,
      excedente: 2_000_00,
    }));
    expect(aviso).toContain("BLD Logística");
    expect(aviso).toContain("Despesas Fixas (Pessoal)");
    expect(aviso).toContain("2026-09");
    expect(aviso).toContain("R$ 12.000,00");
    expect(aviso).toContain("R$ 10.000,00");
  });
});
