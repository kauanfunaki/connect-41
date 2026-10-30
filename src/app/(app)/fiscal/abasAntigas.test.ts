import { beforeEach, describe, expect, it, vi } from "vitest";
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
import Conferencia from "./(legado)/conferencia/page";
import Configuracoes from "./(legado)/configuracoes/page";
import Documentos from "./(legado)/documentos/page";
import Operacao from "./(legado)/operacao/page";
import Classificacao from "./(legado)/classificacao/page";
import Contribuicoes from "./(legado)/contribuicoes/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abrir.mockResolvedValue({ ctx: { tenantId: "t1", userId: "u1" }, setor: ["fiscal"] });
  mocks.modo.mockResolvedValue("local");
  mocks.tela.mockResolvedValue({ contexto: null, motor: { escrita: false, raizes: [] }, mapa: { visiveis: [] }, modulos: [] });
});
describe("compatibilidade com links fiscais antigos", () => {
  it.each([["produtos", "grupo=produtos"], ["apoio", "grupo=apoio"], ["decisoes", "situacao=Classificado"]])("converte a aba de classificação %s em filtro, preservando a busca", async (aba, filtro) => {
    await expect(Classificacao({ searchParams: Promise.resolve({ aba, q: "exemplo" }) })).rejects.toThrow(`redirect:/fiscal/classificacao?q=exemplo&${filtro}`);
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_classificacao");
  });
  it("leva o antigo SPED Contribuições para arquivos da obrigação", async () => {
    await expect(Contribuicoes({ searchParams: Promise.resolve({ aba: "sped" }) })).rejects.toThrow("redirect:/fiscal/entregas?obrigacao=contribuicoes");
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_contribuicoes");
  });
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
  // Recortes da mesma lista viraram filtro dela (15/10/2026).
  it.each(["nfse", "apoio", "quarentena"])("leva a antiga aba %s do acervo para o filtro Grupo", async aba => {
    await expect(Documentos({ searchParams: Promise.resolve({ aba }) })).rejects.toThrow(`redirect:/fiscal/documentos?aba=acervo&grupo=${aba}`);
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_acervo");
    expect(mocks.abrir.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });
  it.each([["fila", "fila"], ["erros", "erro"]])("leva a antiga aba %s das execuções para o filtro Estado", async (aba, estado) => {
    await expect(Operacao({ searchParams: Promise.resolve({ aba }) })).rejects.toThrow(`redirect:/fiscal/operacao?aba=historico&estado=${estado}`);
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_operacao");
  });
  it("não redireciona quem não tem acesso ao módulo", async () => {
    mocks.abrir.mockRejectedValueOnce(new Error("sem acesso"));
    await expect(Conferencia({ searchParams: Promise.resolve({ aba: "depara" }) })).rejects.toThrow("sem acesso");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  // Com o motor real, as abas antigas da prévia não se aplicam: a tela real
  // abre direto, sem passar pelos redirecionamentos (22/10/2026).
  it("no modo real, a página do motor tem precedência sobre os redirecionamentos da prévia", async () => {
    mocks.modo.mockResolvedValue("motor");
    await expect(Configuracoes({ searchParams: Promise.resolve({ aba: "empresas" }) })).resolves.toBeTruthy();
    await expect(Operacao({ searchParams: Promise.resolve({ aba: "fila" }) })).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.tela).toHaveBeenCalled();
  });
});
