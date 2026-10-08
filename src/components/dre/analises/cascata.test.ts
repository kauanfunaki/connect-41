import { describe, expect, it } from "vitest";
import { geometriaDaCascata, type PassoDaCascata } from "@/components/shared/Graficos";

// A ponte da Reconciliação lucro → caixa desenhada como cascata (08/10/2026).
// O que importa testar é a geometria: o total sai do zero, o ajuste flutua de
// onde o anterior parou, e a escala inclui o zero.

const total = (chave: string, valor: number): PassoDaCascata => ({ chave, rotulo: chave, valor, tipo: "total" });
const ajuste = (chave: string, valor: number): PassoDaCascata => ({ chave, rotulo: chave, valor, tipo: "ajuste" });

describe("geometriaDaCascata", () => {
  it("leva o resultado ao caixa: totais do zero, ajustes do acumulado", () => {
    const { barras, minimo, maximo } = geometriaDaCascata([
      total("resultado", 10_000),
      ajuste("nao_recebidas", -4_000),
      ajuste("de_outros_meses", 1_500),
      total("caixa", 7_500),
    ]);
    expect(barras).toEqual([
      { de: 0, ate: 10_000 },
      { de: 10_000, ate: 6_000 },
      { de: 6_000, ate: 7_500 },
      { de: 0, ate: 7_500 },
    ]);
    expect(minimo).toBe(0);
    expect(maximo).toBe(10_000);
  });

  it("estende a escala abaixo do zero quando a ponte passa por ele", () => {
    const { barras, minimo, maximo } = geometriaDaCascata([total("resultado", 2_000), ajuste("pago", -5_000), total("caixa", -3_000)]);
    expect(barras[1]).toEqual({ de: 2_000, ate: -3_000 });
    expect(minimo).toBe(-3_000);
    expect(maximo).toBe(2_000);
  });

  it("recomeça do total quando ele vem no meio — não soma o total aos ajustes", () => {
    const { barras } = geometriaDaCascata([total("a", 100), ajuste("x", 50), total("b", 150), ajuste("y", -20), total("c", 130)]);
    expect(barras[3]).toEqual({ de: 150, ate: 130 });
  });

  it("tudo zero vira escala vazia (a tela mostra o vazio)", () => {
    const { minimo, maximo } = geometriaDaCascata([total("a", 0), ajuste("x", 0), total("b", 0)]);
    expect(maximo - minimo).toBe(0);
  });
});
