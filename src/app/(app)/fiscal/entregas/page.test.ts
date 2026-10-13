import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ abrir: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/auth/modulo", () => ({ abrirTelaDoModulo: mocks.abrir }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/fiscal/previa/FiscalPagina", () => ({ FiscalPagina: () => null }));
import Entregas from "./page";

describe("compatibilidade da antiga aba Domínio", () => {
  it("redireciona para o fluxo do Connect depois de conferir acesso", async () => {
    await expect(Entregas({ searchParams: Promise.resolve({ aba: "dominio" }) })).rejects.toThrow("redirect:/fiscal/entregas?aba=entregas");
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_entregas");
  });
});
