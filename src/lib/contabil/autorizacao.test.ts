import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const EMPRESA = "00000000-0000-4000-8000-000000000001";
const RAIZ = "00123456";
const CHAVE = "contabil:00000000-0000-4000-8000-000000000001";
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "ADMIN" },
  pode: vi.fn(), empresa: vi.fn(), audit: vi.fn(),
  cliente: { obterExecucao: vi.fn(), cancelarExecucao: vi.fn(), criarExecucao: vi.fn(), gravarDecisoes: vi.fn(), obterArquivo: vi.fn(), regerarArquivo: vi.fn(), logDaExecucao: vi.fn() },
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, podeExcluir: () => true }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/contabil/servidor", () => ({ empresaContabilVisivel: m.empresa }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => ({ escrita: true, raizes: ["00123456"], cliente: m.cliente }),
  atorDaSessao: async () => ({ id: "u1", nome: "Pessoa fictícia", email: "teste@exemplo.invalido" }),
  estabelecimentosDaRaiz: async () => ({ visiveis: [{ id: 1, cnpj: "00123456000199", matriz: true, companyId: "00000000-0000-4000-8000-000000000001" }] }),
}));
const permissoes = await import("@/lib/fiscal/motor/acoes");
const operacao = await import("@/app/(app)/fiscal/motor-actions");
const decisoes = await import("@/app/(app)/fiscal/decisoes-actions");
beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1", role: "ADMIN" };
  m.pode.mockImplementation(async (_ctx, modulo) => modulo === "contabil_sped");
  m.empresa.mockImplementation(async (ctx, id) => ctx.tenantId === "t1" && id === EMPRESA ? { id: EMPRESA, baseId: EMPRESA, cnpj: "00123456000199" } : null);
  m.cliente.obterExecucao.mockResolvedValue({ id: 1, acao: "sped_contribuicoes", empresa_id: 1 });
  m.cliente.cancelarExecucao.mockResolvedValue({ id: 1 });
  m.cliente.obterArquivo.mockResolvedValue({ id: 2, obrigacao: "contribuicoes", cnpj: "00123456000199" });
  m.cliente.regerarArquivo.mockResolvedValue({ id: 3 });
  m.cliente.gravarDecisoes.mockResolvedValue({ gravadas: 1, registro_ids: [7] });
});
describe("autorização contábil na API compartilhada", () => {
  it("confere permissão, empresa visível, escritório e raiz antes de escrever", async () => {
    expect(await permissoes.contextoContabilPermitido(m.ctx as never, EMPRESA, RAIZ)).toBe(true);
    expect(await permissoes.contextoContabilPermitido(m.ctx as never, EMPRESA, "99999999")).toBe(false);
    expect(await permissoes.contextoContabilPermitido({ ...m.ctx, tenantId: "t2" } as never, EMPRESA, RAIZ)).toBe(false);
    m.pode.mockResolvedValue(false);
    expect(await permissoes.contextoContabilPermitido(m.ctx as never, EMPRESA, RAIZ, "agir")).toBe(false);
  });
  it("opera Contribuições com contabil_sped mesmo sem permissão fiscal", async () => {
    const r = await operacao.cancelarExecucaoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, id: 1, chave: CHAVE });
    expect(r.ok).toBe(true);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_sped", "agir");
    expect(m.cliente.cancelarExecucao).toHaveBeenCalledOnce();
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.sped.execucao.cancelada" }));
  });
  it("recusa cancelar ou regerar recursos de ICMS/IPI", async () => {
    m.cliente.obterExecucao.mockResolvedValue({ id: 1, acao: "sped", empresa_id: 1 });
    expect((await operacao.cancelarExecucaoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, id: 1, chave: CHAVE })).ok).toBe(false);
    expect(m.cliente.cancelarExecucao).not.toHaveBeenCalled();
    m.cliente.obterArquivo.mockResolvedValue({ id: 2, obrigacao: "icms_ipi", cnpj: "00123456000199" });
    expect((await operacao.regerarArquivoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, id: 2, tipoSped: "0", chave: CHAVE })).ok).toBe(false);
    expect(m.cliente.regerarArquivo).not.toHaveBeenCalled();
  });
  it("não consulta logs de ICMS pelo contexto contábil", async () => {
    m.cliente.obterExecucao.mockResolvedValue({ id: 1, acao: "sped", empresa_id: 1 });
    expect((await operacao.lerExecucaoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, id: 1 })).ok).toBe(false);
    expect(m.cliente.logDaExecucao).not.toHaveBeenCalled();
  });
  it("permite parâmetros de Contribuições e impede decisões fiscais fora da lista", async () => {
    const r = await decisoes.gravarDecisaoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, tipo: "parametro_contribuicoes", chave: { competencia: "2026-10" }, valor: { receita_bruta: "123.45" }, idempotencia: CHAVE });
    expect(r.ok).toBe(true);
    m.cliente.gravarDecisoes.mockClear();
    const proibido = await decisoes.gravarDecisaoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, tipo: "classificacao_item", chave: { cnpj_emit: "00123456000199", cod_prod: "A1" }, valor: { tipo_item: "07" }, idempotencia: CHAVE });
    expect(proibido.ok).toBe(false);
    expect(m.cliente.gravarDecisoes).not.toHaveBeenCalled();
  });
  it("destravar exige gerir e a recusa não envia comando", async () => {
    m.pode.mockImplementation(async (_ctx, modulo, nivel) => modulo === "contabil_sped" && nivel !== "gerir");
    const r = await operacao.destravarExecucaoNoMotor({ empresaContabil: EMPRESA, raiz: RAIZ, id: 1, chave: CHAVE });
    expect(r.ok).toBe(false);
    expect(m.cliente.obterExecucao).not.toHaveBeenCalled();
  });
});
