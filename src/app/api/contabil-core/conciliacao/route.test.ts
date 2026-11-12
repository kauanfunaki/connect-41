import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  lerRazao: vi.fn(),
  lerSispag: vi.fn(),
  conciliar: vi.fn(),
  paraJson: vi.fn(),
  planilha: vi.fn(),
  nome: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/conciliacao/razaoPdf", () => ({ lerRazaoDoArquivo: m.lerRazao }));
vi.mock("@/lib/contabil-core/conciliacao/sispag", async (original) => ({ ...(await original<object>()), lerSispag: m.lerSispag }));
vi.mock("@/lib/contabil-core/conciliacao/relatorio", async (original) => ({ ...(await original<object>()), relatorioParaJson: m.paraJson }));
vi.mock("@/lib/contabil-core/conciliacao/planilhaDoRelatorio", () => ({ planilhaDaConciliacao: m.planilha, nomeDaPlanilha: m.nome }));
vi.mock("@/lib/contabil-core/servidor/conciliacao", () => ({ conciliarRazaoExtrato: m.conciliar }));
const { POST } = await import("./route");
const { RazaoInvalido } = await import("@/lib/contabil-core/conciliacao/razaoTipos");
const { SispagInvalido } = await import("@/lib/contabil-core/conciliacao/sispag");

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const AGENCIA = "00000000-0000-4000-8000-000000000002";
const RAZAO = { contaCodigo: "2699" };
const RELATORIO = {
  resumo: { periodoInicio: "2026-09-01", periodoFim: "2026-09-30", lancamentosRazao: 12, lancamentosExtrato: 11, pendencias: 2, empresa: "Empresa A" },
  sispagUsado: true,
};
const JSON_DO_RELATORIO = {
  resumo: RELATORIO.resumo,
  pendencias: [{ tipo: "SO_RAZAO", razao: [{ data: "2026-09-02", valor: "-10.00", historico: "x", lote: "1", contrapartida: "" }], extrato: [], diferenca: "-10.00", sispagFaltando: [], composicoes: [] }],
};

function req(campos: Record<string, string | File | null> = {}) {
  const form = new FormData();
  const todos = { empresa: EMPRESA, agencia: AGENCIA, arquivo: new File(["razao"], "razao.xlsx"), ...campos };
  for (const [k, v] of Object.entries(todos)) if (v !== null) form.set(k, v);
  return new NextRequest("http://connect/api/contabil-core/conciliacao", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.lerRazao.mockResolvedValue(RAZAO);
  m.lerSispag.mockReturnValue({ conta: "", cnpj: "", pagamentos: [] });
  m.conciliar.mockResolvedValue({ ok: true, valor: RELATORIO });
  m.paraJson.mockReturnValue(JSON_DO_RELATORIO);
  m.planilha.mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
  m.nome.mockReturnValue("conciliacao_2699_2026-09.xlsx");
});

describe("conciliação Razão × extrato", () => {
  it("devolve o relatório com as somas da tela e registra a auditoria sem nome de cliente", async () => {
    const resposta = await POST(req());
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.relatorio).toEqual(JSON_DO_RELATORIO);
    expect(corpo.somas).toEqual([{ totalExtrato: "0", totalRazao: "-10.00", composicoes: [] }]);
    expect(m.lerRazao).toHaveBeenCalledWith(expect.any(Uint8Array), "razao.xlsx");
    expect(m.lerSispag).not.toHaveBeenCalled();
    expect(m.conciliar).toHaveBeenCalledWith("t1", EMPRESA, AGENCIA, RAZAO, null);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contabil.core.conciliacao.gerada",
        entityId: EMPRESA,
        metadata: { agenciaId: AGENCIA, periodoInicio: "2026-09-01", periodoFim: "2026-09-30", formato: "json", lancamentosRazao: 12, lancamentosExtrato: 11, pendencias: 2, sispag: true },
      }),
    );
    expect(JSON.stringify(m.audit.mock.calls[0][0].metadata)).not.toContain("Empresa A");
  });

  it("lê o SISPAG quando vem com conteúdo e ignora o campo vazio", async () => {
    await POST(req({ sispag: new File([], "") }));
    expect(m.lerSispag).not.toHaveBeenCalled();
    await POST(req({ sispag: new File(["sispag"], "sispag.xls") }));
    expect(m.lerSispag).toHaveBeenCalledTimes(1);
    expect(m.conciliar).toHaveBeenLastCalledWith("t1", EMPRESA, AGENCIA, RAZAO, { conta: "", cnpj: "", pagamentos: [] });
  });

  it("formato xlsx devolve a planilha para baixar, sem guardar em cache", async () => {
    const resposta = await POST(req({ formato: "xlsx" }));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(resposta.headers.get("Content-Disposition")).toBe('attachment; filename="conciliacao_2699_2026-09.xlsx"');
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(m.nome).toHaveBeenCalledWith(RAZAO);
    expect(m.paraJson).not.toHaveBeenCalled();
  });

  it("sem login, sem permissão de operar ou com entrada malformada, nada é lido", async () => {
    m.ctx = { tenantId: null, userId: null };
    expect((await POST(req())).status).toBe(401);
    m.ctx = { tenantId: "t1", userId: "u1" };
    m.pode.mockResolvedValueOnce(false);
    expect((await POST(req())).status).toBe(403);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    const malformados: Record<string, string | File | null>[] = [{ empresa: "x" }, { agencia: "" }, { formato: "pdf" }, { arquivo: null }, { arquivo: new File([], "vazio.xlsx") }];
    for (const campos of malformados) {
      expect((await POST(req(campos))).status).toBe(400);
    }
    expect(m.lerRazao).not.toHaveBeenCalled();
    expect(m.conciliar).not.toHaveBeenCalled();
  });

  it("Razão ou SISPAG inválido vira 400 com a mensagem do leitor", async () => {
    m.lerRazao.mockRejectedValueOnce(new RazaoInvalido("O razão traz mais de uma conta."));
    const r1 = await POST(req());
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe("O razão traz mais de uma conta.");
    m.lerSispag.mockImplementationOnce(() => {
      throw new SispagInvalido("Não é a consulta de pagamentos do SISPAG.");
    });
    const r2 = await POST(req({ sispag: new File(["x"], "s.xls") }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe("Não é a consulta de pagamentos do SISPAG.");
    expect(m.conciliar).not.toHaveBeenCalled();
  });

  it("recusa do serviço vira 400, e erro inesperado não vaza a mensagem", async () => {
    m.conciliar.mockResolvedValueOnce({ ok: false, erro: "Conta bancária não encontrada." });
    const r1 = await POST(req());
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe("Conta bancária não encontrada.");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    m.lerRazao.mockRejectedValueOnce(new Error("segredo do arquivo na linha 3"));
    const r2 = await POST(req());
    expect(r2.status).toBe(500);
    expect(JSON.stringify(await r2.json())).not.toContain("segredo");
    expect(JSON.stringify(erro.mock.calls)).not.toContain("segredo");
    erro.mockRestore();
    expect(m.audit).not.toHaveBeenCalled();
  });
});
