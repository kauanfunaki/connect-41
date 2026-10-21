import { describe, expect, it, vi } from "vitest";

// A tela Clientes saiu em 15/10/2026: todo endereço antigo de /clientes leva
// para Empresas, sem passar por consulta nenhuma ao banco.
const mocks = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ClientesRedirect from "./[[...resto]]/page";

describe("links antigos de /clientes", () => {
  // Uma página só (catch-all opcional) responde pela lista, pela ficha, pelo
  // "Novo cliente" e pelo "Editar"; o destino não depende do endereço.
  it("levam para Empresas", () => {
    expect(() => ClientesRedirect()).toThrow("redirect:/empresas");
    expect(mocks.redirect).toHaveBeenCalledWith("/empresas");
  });
});
