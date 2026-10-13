import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ abrir: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/auth/modulo", () => ({ abrirTelaDoModulo: mocks.abrir }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/fiscal/previa/FiscalPagina", () => ({ FiscalPagina: () => null }));
import Conferencia from "./conferencia/page";
import Configuracoes from "./configuracoes/page";

beforeEach(() => { vi.clearAllMocks(); });
describe("compatibilidade com links fiscais antigos", () => {
  it.each(["depara", "lancamentos"])("redireciona %s somente após conferir acesso", async aba => {
    await expect(Conferencia({ searchParams: Promise.resolve({ aba }) })).rejects.toThrow("redirect:/fiscal/conferencia?aba=previa");
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_conferencia");
    expect(mocks.abrir.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });
  it("redireciona cadastro antigo para parâmetros sem quebrar o endereço", async () => {
    await expect(Configuracoes({ searchParams: Promise.resolve({ aba: "empresas" }) })).rejects.toThrow("redirect:/fiscal/configuracoes?aba=parametros");
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_configuracoes");
  });
  it("redireciona a antiga aba CFOP para a consulta unificada após conferir acesso", async () => {
    await expect(Configuracoes({ searchParams: Promise.resolve({ aba: "cfop" }) })).rejects.toThrow("redirect:/fiscal/configuracoes?aba=regras");
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_configuracoes");
    expect(mocks.abrir.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });
  it("não redireciona quem não tem acesso ao módulo", async () => {
    mocks.abrir.mockRejectedValueOnce(new Error("sem acesso"));
    await expect(Conferencia({ searchParams: Promise.resolve({ aba: "depara" }) })).rejects.toThrow("sem acesso");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
