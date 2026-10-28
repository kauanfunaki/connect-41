import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { competenciaDoInstante } from "@/lib/financeiro/periodo";

// O que se testa: a porta das ações. Quem não é administrador do setor não
// chega ao Omie — nem para ler as listas, nem para emitir, nem para cancelar —,
// e o pedido só sai com a confirmação marcada. O lado do Omie e do banco é
// simulado: nenhuma chamada de verdade.
let ctx: AuthContext;
let ligado = true;
let setor = "bpo";
// Sem empresa em foco (21/10/2026): a trava do foco tem o teste dela (`focoServidor.test.ts`).
vi.mock("@/lib/empresas/focoServidor", () => ({
  recusaDoFoco: async () => null,
  leituraNoFoco: async (_ctx: unknown, empresa: string) => ({ ok: true, empresaId: empresa, empresaIds: undefined }),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ctx }));
vi.mock("@/lib/modules", () => {
  const mod = { isModuleEnabled: async () => ligado, setorDoModulo: async () => setor };
  // Os setores da tela (21/10/2026): aqui, só o dono, como antes.
  const setoresDoModulo = async (t: string, c: string) => {
    const s = await (mod.setorDoModulo as (t: string, c: string) => Promise<string | null>)(t, c);
    return s == null ? null : [s];
  };
  return { ...mod, setoresDoModulo };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (a: unknown) => logAudit(a) }));
const servidor = {
  listasParaEmitir: vi.fn(async () => ({ ok: true, listas: {} })),
  emitirNfse: vi.fn(async () => ({ ok: true, emissaoId: "e1", estado: "PROCESSANDO", mensagem: null })),
  cancelarEmissao: vi.fn(async () => ({ ok: true, naPrefeitura: true, mensagem: null })),
};
// O emissor da empresa (lote 2, 28/10/2026): um Omie simulado, e nenhum quando
// `semEmissor` liga — empresa sem conta cadastrada.
let semEmissor = false;
const emissorSimulado = {
  provedor: "omie",
  nome: "Omie",
  entidade: "OmieEmissao",
  listas: (...a: unknown[]) => (servidor.listasParaEmitir as (...a: unknown[]) => unknown)(...a),
  emitir: (...a: unknown[]) => (servidor.emitirNfse as (...a: unknown[]) => unknown)(...a),
  cancelar: (...a: unknown[]) => (servidor.cancelarEmissao as (...a: unknown[]) => unknown)(...a),
};
vi.mock("@/lib/fiscal/nfse/emissores", () => ({
  SEM_EMISSOR: "Esta empresa não tem emissor de NFS-e.",
  emissorDaEmpresa: async () => (semEmissor ? null : emissorSimulado),
  emissorDaEmissao: async (_t: string, id: string) => (semEmissor || id === "nenhuma" ? null : { emissor: emissorSimulado, companyId: "c1" }),
}));

const { carregarListasAction, emitirNfseAction, cancelarEmissaoAction } = await import("./actions");

function perfil(role: AuthContext["role"], sectors: string[]): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

function competenciaDeAgora(): string {
  return competenciaDoInstante(new Date());
}

const pedido = () => ({
  companyId: "c1",
  tomadorCodigo: "2485994",
  servicoCodigo: "2342423",
  valor: "10,00",
  competencia: competenciaDeAgora(),
  descricao: "Teste do piloto",
  categoria: "1.01.02",
  codigoServicoMunicipal: "",
  codigoLC116: "",
  confirmado: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  ligado = true;
  setor = "bpo";
  semEmissor = false;
});

describe("as ações de Emitir NFS-e", () => {
  it("administrador do setor lê as listas, emite e cancela — e tudo vai para o AuditLog", async () => {
    ctx = perfil("SECTOR_ADMIN", ["bpo"]);
    expect(await carregarListasAction("c1", false)).toMatchObject({ ok: true });
    expect(await emitirNfseAction(pedido())).toEqual({ ok: true, estado: "PROCESSANDO", mensagem: null });
    expect(servidor.emitirNfse).toHaveBeenCalledWith({
      tenantId: "t1",
      companyId: "c1",
      userId: "u1",
      pedido: {
        tomadorCodigo: "2485994",
        servicoCodigo: "2342423",
        valorCentavos: 1000,
        competencia: competenciaDeAgora(),
        descricao: "Teste do piloto",
        categoria: "1.01.02",
        codigoServicoMunicipal: null,
        codigoLC116: null,
      },
    });
    expect(await cancelarEmissaoAction("e1")).toEqual({ ok: true, mensagem: null });
    expect(logAudit.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual(["integration.omie.nfse_emitir", "integration.omie.nfse_cancelar"]);
  });

  it("usuário comum do setor não chega ao Omie", async () => {
    ctx = perfil("SECTOR_USER", ["bpo"]);
    expect(await carregarListasAction("c1", false)).toEqual({ ok: false, erro: "Só o administrador do setor emite e cancela NFS-e." });
    expect(await emitirNfseAction(pedido())).toMatchObject({ ok: false });
    expect(await cancelarEmissaoAction("e1")).toMatchObject({ ok: false });
    expect(servidor.listasParaEmitir).not.toHaveBeenCalled();
    expect(servidor.emitirNfse).not.toHaveBeenCalled();
    expect(servidor.cancelarEmissao).not.toHaveBeenCalled();
  });

  it("coordenador de outro setor e leitura geral também não", async () => {
    for (const quem of [perfil("SECTOR_ADMIN", ["dp"]), perfil("READONLY", [])]) {
      ctx = quem;
      expect(await emitirNfseAction(pedido())).toMatchObject({ ok: false });
      expect(await cancelarEmissaoAction("e1")).toMatchObject({ ok: false });
    }
    expect(servidor.emitirNfse).not.toHaveBeenCalled();
    expect(servidor.cancelarEmissao).not.toHaveBeenCalled();
  });

  it("módulo desligado fecha para o administrador do escritório também", async () => {
    ligado = false;
    ctx = perfil("ADMIN", []);
    expect(await emitirNfseAction(pedido())).toEqual({ ok: false, erro: "O módulo Emitir NFS-e não está ligado." });
    expect(servidor.emitirNfse).not.toHaveBeenCalled();
  });

  it("sem a confirmação marcada, o pedido não sai", async () => {
    ctx = perfil("SECTOR_ADMIN", ["bpo"]);
    expect(await emitirNfseAction({ ...pedido(), confirmado: false })).toMatchObject({ ok: false });
    expect(servidor.emitirNfse).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("pedido inválido para antes do Omie", async () => {
    ctx = perfil("SECTOR_ADMIN", ["bpo"]);
    expect(await emitirNfseAction({ ...pedido(), valor: "0" })).toMatchObject({ ok: false });
    expect(await emitirNfseAction({ ...pedido(), competencia: "2020-01" })).toMatchObject({ ok: false });
    // Sem categoria a OS não sai.
    expect(await emitirNfseAction({ ...pedido(), categoria: "" })).toMatchObject({ ok: false });
    expect(servidor.emitirNfse).not.toHaveBeenCalled();
  });

  it("empresa sem emissor para antes de qualquer chamada, e o pedido não vai para o AuditLog", async () => {
    ctx = perfil("SECTOR_ADMIN", ["bpo"]);
    semEmissor = true;
    expect(await carregarListasAction("c1", false)).toEqual({ ok: false, erro: "Esta empresa não tem emissor de NFS-e." });
    expect(await emitirNfseAction(pedido())).toEqual({ ok: false, erro: "Esta empresa não tem emissor de NFS-e." });
    expect(servidor.listasParaEmitir).not.toHaveBeenCalled();
    expect(servidor.emitirNfse).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("emissão que nenhum emissor reconhece não é cancelada", async () => {
    ctx = perfil("SECTOR_ADMIN", ["bpo"]);
    expect(await cancelarEmissaoAction("nenhuma")).toEqual({ ok: false, erro: "Emissão não encontrada." });
    expect(servidor.cancelarEmissao).not.toHaveBeenCalled();
  });

  it("cancelamento recusado pelo Omie também fica no AuditLog", async () => {
    ctx = perfil("SECTOR_ADMIN", ["bpo"]);
    servidor.cancelarEmissao.mockResolvedValueOnce({ ok: false, erro: "ERROR: Prazo de cancelamento expirado" } as never);
    expect(await cancelarEmissaoAction("e1")).toEqual({ ok: false, erro: "ERROR: Prazo de cancelamento expirado" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "integration.omie.nfse_cancelar", metadata: { ok: false, erro: "ERROR: Prazo de cancelamento expirado" } }));
  });
});
