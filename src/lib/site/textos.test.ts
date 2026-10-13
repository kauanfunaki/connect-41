import { describe, expect, it } from "vitest";
import { QUEM_OPERA } from "./textos";

describe("QUEM_OPERA", () => {
  // A frase passou a ser montada com as partes de EMPRESA (o "Sobre nós" do
  // site usa o nome e a cidade). A /sobre, que o Google confere, mostra esta
  // frase: ela não pode mudar por acidente.
  it("continua a mesma frase do rodapé da /sobre", () => {
    expect(QUEM_OPERA).toBe(
      "O Connect é desenvolvido e operado pela 41 TEC LTDA (CNPJ 64.620.403/0001-16), Rua Anne Frank, 2210, Boqueirão, Curitiba/PR.",
    );
  });
});
