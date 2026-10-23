import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// As páginas no modo motor: o gate do módulo ("ver") vem antes de tudo, cada
// aba escolhe o seu conteúdo, e a Conferência abre na competência do motor.
const mocks = vi.hoisted(() => ({ abrir: vi.fn(), modo: vi.fn(), tela: vi.fn(), competencias: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/modulo", () => ({ abrirTelaDoModulo: mocks.abrir, podeNoModulo: async () => true }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({ modoDoFiscal: mocks.modo }));
vi.mock("@/lib/fiscal/motor/tela", () => ({ prepararTelaDoMotor: mocks.tela }));
vi.mock("@/lib/fiscal/motor/permissoes", () => ({ permissoesDeDecisao: async () => ({}) }));
vi.mock("@/lib/fiscal/motor/telas/conferencia", async (orig) => ({ ...(await orig<object>()), competenciasDaConferencia: mocks.competencias }));
vi.mock("@/components/fiscal/motor/CascoDoMotor", () => ({ CascoDoMotor: () => null, SemFonteNoMotor: () => null }));
vi.mock("@/components/fiscal/motor/DecisoesMotor", () => ({ DecisoesMotor: () => null }));
vi.mock("@/components/fiscal/previa/FiscalPagina", () => ({ FiscalPagina: () => null }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const { default: Conferencia } = await import("./conferencia/page");
const { default: Documentos } = await import("./documentos/page");
const { default: IcmsIpi } = await import("./icms-ipi/page");
const { default: Contribuicoes } = await import("./contribuicoes/page");
const { ConfrontoMotor, PreviaFinanceiraMotor } = await import("@/components/fiscal/motor/ConferenciaMotor");
const { AcervoMotor, CoberturaMotor, ImportacoesMotor } = await import("@/components/fiscal/motor/DocumentosMotor");
const { ApuracaoIcmsMotor, DcipDimeMotor, DemonstrativoIcmsMotor } = await import("@/components/fiscal/motor/IcmsIpiMotor");
const { DemonstrativoContribMotor, FechamentoMotor } = await import("@/components/fiscal/motor/ContribuicoesMotor");

type Props = { tela: { contexto: { competencia: string } | null }; aba?: string; abas?: { chave: string }[]; children: unknown };
const TELA = { contexto: { raiz: "17122471", estabelecimentoId: null, competencia: "2026-10" }, motor: { escrita: false, raizes: ["17122471"] }, mapa: { visiveis: [] }, modulos: [] };

/** Os componentes que a página pôs dentro do casco (atravessando Suspense e fragmentos). */
function conteudo(el: ReactElement): unknown[] {
  const saida: unknown[] = [];
  const andar = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(andar); return; }
    const e = n as ReactElement<{ children?: unknown }>;
    saida.push(e.type);
    andar(e.props?.children);
  };
  andar((el.props as Props).children);
  return saida;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abrir.mockResolvedValue({ ctx: { tenantId: "t1", userId: "u1" }, setor: ["fiscal"] });
  mocks.modo.mockResolvedValue("motor");
  mocks.tela.mockResolvedValue(TELA);
  mocks.competencias.mockResolvedValue({ dados: ["2026-09", "2026-08"], erro: null });
});

describe("Conferência fiscal no modo motor", () => {
  it("abre pelo módulo fiscal_conferencia e, sem competência na URL, na primeira do motor", async () => {
    const el = (await Conferencia({ searchParams: Promise.resolve({}) })) as ReactElement<Props>;
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_conferencia");
    expect(el.props.tela.contexto?.competencia).toBe("2026-09");
    expect(el.props.aba).toBe("previa");
    expect(conteudo(el)).toContain(PreviaFinanceiraMotor);
  });
  it("com competência na URL, mantém a pedida; aba confronto", async () => {
    const el = (await Conferencia({ searchParams: Promise.resolve({ competencia: "2026-10", aba: "confronto" }) })) as ReactElement<Props>;
    expect(el.props.tela.contexto?.competencia).toBe("2026-10");
    expect(conteudo(el)).toContain(ConfrontoMotor);
  });
  it("quem não abre o módulo não chega a ler o motor", async () => {
    mocks.abrir.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(Conferencia({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.tela).not.toHaveBeenCalled();
    expect(mocks.competencias).not.toHaveBeenCalled();
  });
});

describe("abas das outras telas no modo motor", () => {
  it.each([[undefined, AcervoMotor], ["importacoes", ImportacoesMotor], ["cobertura", CoberturaMotor]])("Documentos › %s", async (aba, componente) => {
    const el = (await Documentos({ searchParams: Promise.resolve(aba ? { aba } : {}) })) as ReactElement<Props>;
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_acervo");
    expect(conteudo(el)).toContain(componente);
  });
  it.each([["apuracao", ApuracaoIcmsMotor], ["demonstrativo", DemonstrativoIcmsMotor], ["dcip-dime", DcipDimeMotor]])("ICMS e IPI › %s", async (aba, componente) => {
    const el = (await IcmsIpi({ searchParams: Promise.resolve({ aba }) })) as ReactElement<Props>;
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_icms_ipi");
    expect(conteudo(el)).toContain(componente);
  });
  it("ICMS e IPI abre em Ajustes (leve), nunca numa leitura pesada", async () => {
    const el = (await IcmsIpi({ searchParams: Promise.resolve({}) })) as ReactElement<Props>;
    expect(el.props.aba).toBe("ajustes");
    expect(conteudo(el)).not.toContain(ApuracaoIcmsMotor);
  });
  it.each([["fechamento", FechamentoMotor], ["demonstrativo", DemonstrativoContribMotor]])("PIS e COFINS › %s", async (aba, componente) => {
    const el = (await Contribuicoes({ searchParams: Promise.resolve({ aba }) })) as ReactElement<Props>;
    expect(mocks.abrir).toHaveBeenCalledWith("fiscal_contribuicoes");
    expect(conteudo(el)).toContain(componente);
  });
});
