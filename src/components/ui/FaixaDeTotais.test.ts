import { describe, expect, it } from "vitest";
import { indiceDoDestaque, type ItemDeTotal } from "./FaixaDeTotais";

const item = (rotulo: string, extra: Partial<ItemDeTotal> = {}): ItemDeTotal => ({ rotulo, valor: "1", ...extra });

describe("indiceDoDestaque", () => {
  it("o primeiro total neutro é o número principal", () => {
    expect(indiceDoDestaque([item("A pagar"), item("Vencido", { tom: "text-danger" }), item("Pago", { tom: "text-success-fg" })])).toBe(0);
  });

  it("o primeiro em azul (tom marca) também vale", () => {
    expect(indiceDoDestaque([item("Novas", { tom: "text-brand" }), item("Respondidas")])).toBe(0);
  });

  it("primeiro número com situação não vira destaque", () => {
    expect(indiceDoDestaque([item("Vencido", { tom: "text-danger" }), item("A vencer")])).toBeNull();
    expect(indiceDoDestaque([item("Vence hoje", { tom: "text-warning-fg" }), item("Total")])).toBeNull();
    expect(indiceDoDestaque([item("Pago", { tom: "text-success-fg" }), item("Total")])).toBeNull();
    expect(indiceDoDestaque([item("Sem movimento", { tom: "text-fg-muted" }), item("Total")])).toBeNull();
  });

  it("faixa que serve de filtro não tem destaque, nem com o recorte desligado", () => {
    expect(indiceDoDestaque([item("Todas", { ativo: true }), item("Vencidas", { ativo: false })])).toBeNull();
    expect(indiceDoDestaque([item("Todas", { ativo: false }), item("Vencidas")])).toBeNull();
  });

  it("faixa de um número só, ou vazia, não tem o que destacar", () => {
    expect(indiceDoDestaque([item("Total")])).toBeNull();
    expect(indiceDoDestaque([])).toBeNull();
  });
});
