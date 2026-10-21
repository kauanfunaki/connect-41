import { beforeEach, describe, expect, it, vi } from "vitest";

// Quem pode, nas actions da Receita (Fase 1, 20/10/2026). Abrir mensagem da
// Caixa Postal dá ciência da intimação: decisão do Kauan — só a coordenação do
// Fiscal, e só depois de confirmar. Pedir a situação fiscal (cobrada): quem edita.

const m = vi.hoisted(() => ({
  acesso: null as null | { tenantId: string; ctx: { userId: string }; podeEditar: boolean; podeConfigurar: boolean },
  abrirMensagem: vi.fn(async () => ({ ok: true as const, mensagem: { id: "m", assunto: "a", corpo: "<p>c</p>", abertaEm: "2026-10-20T13:00:00.000Z", abertaPor: "x" } })),
  mensagemJaAberta: vi.fn(async () => null),
  pedirSituacaoFiscal: vi.fn(async () => ({ ok: true as const, texto: "ok", pronto: false })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({}) }));
vi.mock("@/lib/autorizacoes/servidor", () => ({ acessoAsAutorizacoes: async () => m.acesso }));
vi.mock("@/lib/serpro/acompanhamento", () => ({ abrirMensagem: m.abrirMensagem, mensagemJaAberta: m.mensagemJaAberta }));
vi.mock("@/lib/serpro/situacaoFiscal", () => ({ pedirSituacaoFiscal: m.pedirSituacaoFiscal }));

const { abrirMensagemAction, pedirSituacaoFiscalAction, verMensagemAction } = await import("./receita-actions");

const ID = "0f8e7c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b";
const acesso = (podeEditar: boolean, podeConfigurar: boolean) => ({ tenantId: "t-41", ctx: { userId: "u-1" }, podeEditar, podeConfigurar });

beforeEach(() => {
  vi.clearAllMocks();
  m.acesso = null;
});

describe("abrir mensagem da Caixa Postal", () => {
  it("quem só edita no Fiscal não abre: nada é chamado", async () => {
    m.acesso = acesso(true, false);
    expect(await abrirMensagemAction(ID, true)).toMatchObject({ ok: false, erro: expect.stringMatching(/coordenação do Fiscal/) });
    expect(m.abrirMensagem).not.toHaveBeenCalled();
  });

  it("a coordenação, sem a confirmação, também não abre", async () => {
    m.acesso = acesso(true, true);
    expect(await abrirMensagemAction(ID, "sim")).toMatchObject({ ok: false, erro: expect.stringMatching(/Confirme/) });
    expect(m.abrirMensagem).not.toHaveBeenCalled();
  });

  it("a coordenação, com a confirmação, abre", async () => {
    m.acesso = acesso(false, true);
    expect(await abrirMensagemAction(ID, true)).toMatchObject({ ok: true });
    expect(m.abrirMensagem).toHaveBeenCalledWith("t-41", "u-1", ID);
  });

  it("ler a já aberta é de quem vê o setor, e não chama o Serpro", async () => {
    m.acesso = acesso(false, false);
    expect(await verMensagemAction(ID)).toEqual({ ok: false, erro: "Esta mensagem ainda não foi aberta." });
    expect(m.mensagemJaAberta).toHaveBeenCalledWith("t-41", ID);
    expect(m.abrirMensagem).not.toHaveBeenCalled();
    m.acesso = null;
    expect(await verMensagemAction(ID)).toEqual({ ok: false, erro: "Sem acesso." });
  });
});

describe("pedir a situação fiscal", () => {
  it("só quem edita no Fiscal, e com um id de empresa", async () => {
    m.acesso = acesso(false, true);
    expect(await pedirSituacaoFiscalAction(ID)).toMatchObject({ ok: false });
    m.acesso = acesso(true, false);
    expect(await pedirSituacaoFiscalAction("não é id")).toMatchObject({ ok: false, erro: "Empresa não encontrada." });
    expect(await pedirSituacaoFiscalAction(ID)).toMatchObject({ ok: true });
    expect(m.pedirSituacaoFiscal).toHaveBeenCalledTimes(1);
  });
});
