import { describe, expect, it } from "vitest";
import { montarCenario, premissaValida } from "./cenario";
import { diasSemBanco, montarPrevisto, type TituloDoPrevisto } from "./projecao";

const HOJE = "2026-11-25";
const regras = { diasReceber: 0, diasPagar: 0, semBanco: diasSemBanco(HOJE) };

function conta(kind: "PAGAR" | "RECEBER", reais: number, venc: string, extra: Partial<TituloDoPrevisto> = {}): TituloDoPrevisto {
  return { id: venc + reais, kind, centavos: reais * 100, vencimentoKey: venc, previsaoKey: null, categoryId: null, contraparte: "X", descricao: null, ...extra };
}

const classificar = (t: TituloDoPrevisto) =>
  t.pedido ? { linha: "pedidos", item: t.pedido.etapa } : t.kind === "RECEBER" ? { linha: "recebimentos", item: "Vendas" } : { linha: "pessoal", item: "Folha" };

describe("montarCenario", () => {
  const titulos = [
    conta("RECEBER", 10_000, "2026-12-02"),
    conta("RECEBER", 2_000, "2026-12-10", { pedido: { etapa: "Em produção" } }),
    conta("PAGAR", 8_000, "2026-12-05"),
  ];
  const previsto = montarPrevisto({ titulos, classificar, regras, hojeKey: HOJE, granularidade: "meses", saldoInicial: 1_000_00 });

  it("vendas do mês somam recebimentos e pedidos; fixo e percentual saem com o sinal de menos e acumulam no saldo", () => {
    const c = montarCenario(previsto, [
      { nome: "Comissões", tipo: "percentual", valor: 5 },
      { nome: "Frete", tipo: "fixo", valor: 300 },
    ]);
    expect(c.vendas.slice(0, 2)).toEqual([0, 12_000_00]);
    expect(c.premissas[0]!.valores.slice(0, 2)).toEqual([-0, -600_00]);
    expect(c.premissas[1]!.valores.slice(0, 2)).toEqual([-300_00, -300_00]);
    expect(c.totalDasPremissas.slice(0, 2)).toEqual([-300_00, -900_00]);
    // Novembro: 1.000 − 300; dezembro: 1.000 + 12.000 − 8.000 − 300 − 900.
    expect(c.saldoPrevisto.slice(0, 2)).toEqual([1_000_00, 5_000_00]);
    expect(c.saldoComPremissas.slice(0, 2)).toEqual([700_00, 3_800_00]);
    // Doze meses de frete: o fim do ano com premissas tem 12 × 300 e 600 de comissão a menos.
    expect(c.saldoComPremissas.at(-1)).toBe(5_000_00 - 12 * 300_00 - 600_00);
    // O menor é novembro (700), antes de a venda de dezembro entrar.
    expect(c.menorComPremissas).toMatchObject({ centavos: 700_00, periodo: { inicioKey: "2026-11-25" } });
  });

  it("sem premissas, o cenário é o previsto", () => {
    const c = montarCenario(previsto, []);
    expect(c.saldoComPremissas).toEqual(c.saldoPrevisto);
  });
});

describe("premissaValida", () => {
  it("limpa o nome e recusa o que não faz sentido", () => {
    expect(premissaValida({ nome: "  Frete  ", tipo: "fixo", valor: 300 })).toEqual({ ok: true, premissa: { nome: "Frete", tipo: "fixo", valor: 300 } });
    expect(premissaValida({ nome: "", tipo: "fixo", valor: 1 }).ok).toBe(false);
    expect(premissaValida({ nome: "X", tipo: "outro", valor: 1 }).ok).toBe(false);
    expect(premissaValida({ nome: "X", tipo: "percentual", valor: 120 }).ok).toBe(false);
    expect(premissaValida({ nome: "X", tipo: "fixo", valor: -1 }).ok).toBe(false);
  });
});
