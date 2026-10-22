import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ abrir: vi.fn(), modo: vi.fn(), tela: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/modulo", () => ({ abrirTelaDoModulo: mocks.abrir, podeNoModulo: async () => true }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({ modoDoFiscal: mocks.modo }));
vi.mock("@/lib/fiscal/motor/tela", () => ({ prepararTelaDoMotor: mocks.tela }));
vi.mock("@/components/fiscal/motor/DecisoesMotor", () => ({ DecisoesMotor: () => null }));
vi.mock("@/lib/fiscal/motor/permissoes", () => ({ permissoesDeDecisao: async () => ({}) }));
vi.mock("@/components/fiscal/motor/CascoDoMotor", () => ({ CascoDoMotor: () => null, SemFonteNoMotor: () => null }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/fiscal/previa/FiscalPagina", () => ({ FiscalPagina: () => null }));
import Entregas from "./page";

describe("compatibilidade da antiga aba Domínio", () => {
  it("redireciona para o fluxo do Connect depois de conferir acesso", async () => {
    mocks.abrir.mockResolvedValue({ ctx: { tenantId: "t1" }, setor: ["fiscal"] });
    mocks.modo.mockResolvedValue("local");
    await expect(Entregas({ searchParams: Promise.resolve({ aba: "dominio" }) })).rejects.toThrow("redirect:/fiscal/entregas?aba=entregas");
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_entregas");
  });
});
