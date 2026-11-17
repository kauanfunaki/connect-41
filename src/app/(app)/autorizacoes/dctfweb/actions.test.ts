import { beforeEach, describe, expect, it, vi } from "vitest";

// A DCTFWeb do mês (17/11/2026): só quem edita nas Autorizações marca empresas,
// ajusta a rotina e roda — o "Rodar agora" gasta. Competência só de mês acabado.

const m = vi.hoisted(() => ({
  acesso: null as unknown,
  foco: null as string | null,
  marcar: vi.fn(),
  salvar: vi.fn(),
  rodar: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/autorizacoes/servidor", () => ({ acessoAsAutorizacoes: async () => m.acesso }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => m.foco }));
vi.mock("@/lib/serpro/dctfwebDoMes", () => ({ marcarEmpresas: m.marcar, salvarAjusteDaRotina: m.salvar, rodarAgora: m.rodar }));
vi.mock("@/lib/datas/calendario", () => ({ hojeIso: () => "2026-11-17" }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { marcarEmpresasAction, rodarAgoraAction, salvarAjusteAction } = await import("./actions");

const ID = "11111111-2222-3333-4444-555555555555";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  m.acesso = { tenantId: "t1", ctx: { userId: "u1" }, podeEditar: true };
  m.foco = null;
  vi.clearAllMocks();
  m.marcar.mockResolvedValue(1);
  m.rodar.mockResolvedValue({ ok: true, naFila: 3, resumo: { competencia: "2026-10", tratadas: 2, porSituacao: { BAIXADO: 1, SEM_DECLARACAO: 1 }, parou: null } });
});

describe("as actions da DCTFWeb do mês", () => {
  it("quem só vê não marca, não ajusta e não roda", async () => {
    m.acesso = { tenantId: "t1", ctx: { userId: "u1" }, podeEditar: false };
    expect(await marcarEmpresasAction([ID], true)).toMatchObject({ ok: false });
    expect(await salvarAjusteAction(form({ diaSemEvento: "16" }))).toMatchObject({ ok: false });
    expect(await rodarAgoraAction("2026-10", null)).toMatchObject({ ok: false });
    expect(m.rodar).not.toHaveBeenCalled();
  });

  it("marca empresas e registra", async () => {
    expect(await marcarEmpresasAction([ID], true)).toEqual({ ok: true, texto: "1 empresa entrou." });
    expect(m.marcar).toHaveBeenCalledWith("t1", [ID], true);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "autorizacoes.dctfweb_empresas" }));
    expect(await marcarEmpresasAction(["x"], true)).toMatchObject({ ok: false });
  });

  it("o ajuste confere o dia e o teto", async () => {
    expect(await salvarAjusteAction(form({ ligada: "on", diaSemEvento: "16", teto: "150,00" }))).toMatchObject({ ok: true });
    expect(m.salvar).toHaveBeenCalledWith("t1", { ligada: true, diaSemEvento: 16, tetoCentavos: 15000 });
    expect(await salvarAjusteAction(form({ diaSemEvento: "30" }))).toMatchObject({ ok: false, erro: expect.stringContaining("1 a 28") });
    expect(await salvarAjusteAction(form({ diaSemEvento: "16", teto: "abc" }))).toMatchObject({ ok: false });
    expect(await salvarAjusteAction(form({ diaSemEvento: "16", teto: "" }))).toMatchObject({ ok: true });
    expect(m.salvar).toHaveBeenLastCalledWith("t1", { ligada: false, diaSemEvento: 16, tetoCentavos: null });
  });

  it("rodar agora: só mês acabado, e diz o que ficou na fila", async () => {
    expect(await rodarAgoraAction("2026-11", null)).toMatchObject({ ok: false, erro: expect.stringContaining("já acabou") });
    const r = await rodarAgoraAction("2026-10", null);
    expect(m.rodar).toHaveBeenCalledWith("t1", "u1", "2026-10", null);
    expect(r).toEqual({ ok: true, texto: "2 de 3 tratadas agora (1 baixado, 1 sem declaração transmitida). As outras 1 seguem na fila do agendador, a cada 10 minutos." });
    await rodarAgoraAction("2026-10", ID);
    expect(m.rodar).toHaveBeenLastCalledWith("t1", "u1", "2026-10", [ID]);
  });

  it("fora da empresa em foco, não roda", async () => {
    m.foco = "Você está trabalhando em outra empresa.";
    expect(await rodarAgoraAction("2026-10", ID)).toEqual({ ok: false, erro: "Você está trabalhando em outra empresa." });
    expect(m.rodar).not.toHaveBeenCalled();
  });
});
