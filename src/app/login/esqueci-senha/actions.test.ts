import { beforeEach, describe, expect, it, vi } from "vitest";

// Esqueci a senha com o mesmo e-mail em mais de um escritório (06/10/2026):
// um link por conta, cada um amarrado à conta dele e enviado pelo SMTP do
// escritório dela — e a tela responde igual, exista uma conta, duas ou nenhuma.

const user = { findMany: vi.fn() };
const portalUser = { findMany: vi.fn() };
const tenantSmtpConfig = { findUnique: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user, portalUser, tenantSmtpConfig }) }));
const createPasswordResetToken = vi.fn(async (id: string) => `token-de-${id}`);
vi.mock("@/lib/auth/passwordReset", () => ({ createPasswordResetToken }));
const sendPasswordResetEmail = vi.fn<(input: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("@/lib/email/sendMail", () => ({ sendPasswordResetEmail }));

const { solicitarRedefinicaoSenha } = await import("./actions");

function pedir(email: string) {
  const form = new FormData();
  form.set("email", email);
  return solicitarRedefinicaoSenha(null, form);
}

function conta(id: string, tenantId: string, escritorio: string) {
  return { id, tenantId, tenant: { name: escritorio } };
}

beforeEach(() => {
  vi.clearAllMocks();
  portalUser.findMany.mockResolvedValue([]);
  tenantSmtpConfig.findUnique.mockResolvedValue({ tenantId: "qualquer" });
});

describe("esqueci a senha da equipe", () => {
  it("um e-mail só: um link, com o e-mail de sempre (sem nome de escritório)", async () => {
    user.findMany.mockResolvedValue([conta("conta-a", "escritorio-a", "Escritório A")]);
    expect(await pedir("Pessoa@Exemplo.com")).toEqual({ success: true });

    expect(user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "pessoa@exemplo.com", active: true } }));
    expect(createPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(createPasswordResetToken).toHaveBeenCalledWith("conta-a");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      tenantId: "escritorio-a",
      to: "pessoa@exemplo.com",
      resetToken: "token-de-conta-a",
      escritorio: undefined,
    });
  });

  it("dois escritórios: um link por conta, cada um pelo escritório dela e dizendo qual é", async () => {
    user.findMany.mockResolvedValue([conta("conta-a", "escritorio-a", "Escritório A"), conta("conta-b", "escritorio-b", "Escritório B")]);
    expect(await pedir("pessoa@exemplo.com")).toEqual({ success: true });

    expect(createPasswordResetToken.mock.calls.map((c) => c[0])).toEqual(["conta-a", "conta-b"]);
    expect(sendPasswordResetEmail.mock.calls.map((c) => c[0])).toEqual([
      { tenantId: "escritorio-a", to: "pessoa@exemplo.com", resetToken: "token-de-conta-a", escritorio: "Escritório A" },
      { tenantId: "escritorio-b", to: "pessoa@exemplo.com", resetToken: "token-de-conta-b", escritorio: "Escritório B" },
    ]);
    // A conta interna vence: o portal nem é consultado.
    expect(portalUser.findMany).not.toHaveBeenCalled();
  });

  it("escritório sem SMTP fica sem link, e o outro recebe o dele", async () => {
    user.findMany.mockResolvedValue([conta("conta-a", "escritorio-a", "Escritório A"), conta("conta-b", "escritorio-b", "Escritório B")]);
    tenantSmtpConfig.findUnique.mockImplementation(async ({ where }: { where: { tenantId: string } }) =>
      where.tenantId === "escritorio-a" ? null : { tenantId: where.tenantId }
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pedir("pessoa@exemplo.com")).toEqual({ success: true });
    expect(createPasswordResetToken.mock.calls.map((c) => c[0])).toEqual(["conta-b"]);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("sem conta nenhuma, a resposta é a mesma — não diz quantas contas existem", async () => {
    user.findMany.mockResolvedValue([]);
    expect(await pedir("ninguem@exemplo.com")).toEqual({ success: true });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
