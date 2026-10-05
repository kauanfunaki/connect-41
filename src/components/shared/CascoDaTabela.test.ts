import { describe, expect, it } from "vitest";
import { contarItens } from "./CascoDaTabela";

describe("contarItens", () => {
  it("usa o singular só para um", () => {
    expect(contarItens(1, "conta", "contas")).toBe("1 conta");
    expect(contarItens(0, "conta", "contas")).toBe("0 contas");
    expect(contarItens(38, "conta", "contas")).toBe("38 contas");
  });

  it("separa o milhar como no resto do app", () => {
    expect(contarItens(2000, "título", "títulos")).toBe("2.000 títulos");
  });

  it("marca com + quando a consulta parou no teto", () => {
    expect(contarItens(500, "solicitação", "solicitações", true)).toBe("500+ solicitações");
    expect(contarItens(1, "pedido", "pedidos", true)).toBe("1+ pedidos");
  });
});
