import { describe, expect, it, vi } from "vitest";

// Fornecedores e sacados virou aba de Cadastros em 21/10/2026: todo endereço
// antigo de /cadastros-financeiros leva ao novo, com a mesma empresa e aba.
const mocks = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import CadastrosFinanceirosRedirect from "./[[...resto]]/page";

const abrir = (busca: Record<string, string | string[] | undefined>) => CadastrosFinanceirosRedirect({ searchParams: Promise.resolve(busca) });

describe("links antigos de /cadastros-financeiros", () => {
  it("sem busca, levam a Fornecedores e sacados", async () => {
    await expect(abrir({})).rejects.toThrow("redirect:/fornecedores-e-sacados");
  });

  // O link de Projetos do lançamento e o de Sacados da cobrança traziam a
  // empresa e a aba: o favorito antigo tem de abrir no mesmo lugar.
  it("levam a empresa, a aba e o resto da busca", async () => {
    await expect(abrir({ empresa: "c1", aba: "projetos", q: "posto & cia", vazio: undefined })).rejects.toThrow(
      "redirect:/fornecedores-e-sacados?empresa=c1&aba=projetos&q=posto+%26+cia",
    );
  });

  it("parâmetro repetido continua repetido", async () => {
    await expect(abrir({ x: ["1", "2"] })).rejects.toThrow("redirect:/fornecedores-e-sacados?x=1&x=2");
  });
});
