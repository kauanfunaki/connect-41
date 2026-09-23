import { describe, it, expect } from "vitest";
import { categoriasParaCriar } from "./categoriasDoImport";

describe("categoriasParaCriar", () => {
  it("cria só as que faltam, com o grupo do padrão quando conhece o nome", () => {
    const r = categoriasParaCriar(
      ["Clientes - Venda de Mercadoria Fabricadas", "Entrada de Transferência", "Tarifas Bancárias", null, ""],
      ["tarifas bancarias"],
      "recebimento"
    );
    expect(r).toEqual([
      { name: "Clientes - Venda de Mercadoria Fabricadas", kind: "RECEBER", dreGroup: "receita_bruta" },
      { name: "Entrada de Transferência", kind: "RECEBER", dreGroup: null },
    ]);
  });

  it("não repete o mesmo nome escrito de outro jeito", () => {
    const r = categoriasParaCriar(["Compra de Serviços", "compra de  servicos"], [], "pagamento");
    expect(r).toEqual([{ name: "Compra de Serviços", kind: "PAGAR", dreGroup: "cmv" }]);
  });
});
