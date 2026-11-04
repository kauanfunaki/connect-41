import { describe, expect, it } from "vitest";
import { textoDoPedidoDeDocumentos } from "./pedidoDeDocumentos";

describe("textoDoPedidoDeDocumentos", () => {
  it("lista o que falta, um item por linha", () => {
    const texto = textoDoPedidoDeDocumentos("Alteração contratual", ["RG dos sócios", "Comprovante de endereço"]);
    expect(texto).toContain("processo de Alteração contratual");
    expect(texto).toContain("- RG dos sócios\n- Comprovante de endereço");
  });
  it("sem nada faltando, não há pedido", () => {
    expect(textoDoPedidoDeDocumentos("Baixa", [])).toBe("");
  });
});
