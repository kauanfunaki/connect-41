import { beforeEach, describe, expect, it, vi } from "vitest";

// A troca de senha em "Minha conta" do portal (08/10/2026): confere a senha
// atual, a regra da senha nova é a mesma do link de redefinição, e há limite
// de tentativas por conta. O link de "criar senha" vai só para o e-mail da
// conta logada.

const portalUser = { findFirst: vi.fn(), update: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ portalUser }) }));
const getPortalSession = vi.fn();
vi.mock("@/lib/auth/portal", () => ({ getPortalSession }));

const HASH_GUARDADO = "hash-guardado";
const SENHA_ATUAL = "atual-do-cliente";
const SENHA_NOVA = "nova-do-cliente";
const verifyPassword = vi.fn(async (texto: string, hash: string) => texto === SENHA_ATUAL && hash === HASH_GUARDADO);
const hashPassword = vi.fn(async (texto: string) => `hash-de-${texto}`);
vi.mock("@/lib/auth/password", () => ({ verifyPassword, hashPassword }));
const createPasswordResetToken = vi.fn(async (id: string) => `token-de-${id}`);
vi.mock("@/lib/auth/passwordReset", () => ({ createPasswordResetToken }));
const sendPasswordResetEmail = vi.fn<(input: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("@/lib/email/sendMail", () => ({ sendPasswordResetEmail }));

const { trocarSenhaDoPortal, enviarLinkParaCriarSenha } = await import("./actions");

// O limite de tentativas é o de verdade (em memória, por conta): cada teste
// usa uma conta nova para não herdar as tentativas do anterior.
let contador = 0;
let contaId = "";

beforeEach(() => {
  vi.clearAllMocks();
  contaId = `conta-${++contador}`;
  getPortalSession.mockResolvedValue({ kind: "portal", sub: contaId, tenantId: "escritorio-a", clientGroupId: "grupo-a" });
  portalUser.findFirst.mockImplementation(async () => ({
    id: contaId,
    tenantId: "escritorio-a",
    email: "cliente@exemplo.com",
    passwordHash: HASH_GUARDADO,
  }));
});

function trocar(campos: { atual?: string; senha?: string; confirmacao?: string }) {
  const form = new FormData();
  for (const [nome, valor] of Object.entries(campos)) form.set(nome, valor);
  return trocarSenhaDoPortal(null, form);
}

describe("trocarSenhaDoPortal", () => {
  it("troca a senha quando a atual confere, e grava o hash da nova", async () => {
    expect(await trocar({ atual: SENHA_ATUAL, senha: SENHA_NOVA, confirmacao: SENHA_NOVA })).toEqual({ ok: true });

    expect(portalUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: contaId, tenantId: "escritorio-a", clientGroupId: "grupo-a", active: true } })
    );
    expect(hashPassword).toHaveBeenCalledWith(SENHA_NOVA);
    expect(portalUser.update).toHaveBeenCalledWith({ where: { id: contaId }, data: { passwordHash: `hash-de-${SENHA_NOVA}` } });
  });

  it("senha atual errada: não troca, e aponta o link para quem nunca criou senha", async () => {
    const r = await trocar({ atual: "outra-coisa", senha: SENHA_NOVA, confirmacao: SENHA_NOVA });
    expect(r).toEqual({ erro: expect.stringContaining("Senha atual incorreta") });
    expect(r && "erro" in r && r.erro).toContain("link abaixo");
    expect(portalUser.update).not.toHaveBeenCalled();
  });

  it("senha nova fraca: a mesma regra do link de redefinição, sem conferir a atual", async () => {
    expect(await trocar({ atual: SENHA_ATUAL, senha: "curta", confirmacao: "curta" })).toEqual({
      erro: "A senha precisa ter ao menos 8 caracteres.",
    });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(portalUser.update).not.toHaveBeenCalled();
  });

  it("confirmação diferente da nova: não troca", async () => {
    expect(await trocar({ atual: SENHA_ATUAL, senha: SENHA_NOVA, confirmacao: `${SENHA_NOVA}-x` })).toEqual({
      erro: "As senhas não coincidem.",
    });
    expect(portalUser.update).not.toHaveBeenCalled();
  });

  it("sem a senha atual, ou com a nova igual à atual: não troca", async () => {
    expect(await trocar({ senha: SENHA_NOVA, confirmacao: SENHA_NOVA })).toEqual({ erro: "Informe a senha atual." });
    expect(await trocar({ atual: SENHA_ATUAL, senha: SENHA_ATUAL, confirmacao: SENHA_ATUAL })).toEqual({
      erro: "A senha nova precisa ser diferente da atual.",
    });
    expect(portalUser.update).not.toHaveBeenCalled();
  });

  it("sem sessão, ou com a conta desativada: pede para entrar de novo", async () => {
    getPortalSession.mockResolvedValueOnce(null);
    expect(await trocar({ atual: SENHA_ATUAL, senha: SENHA_NOVA, confirmacao: SENHA_NOVA })).toEqual({
      erro: "Sessão expirada. Entre de novo no portal.",
    });
    portalUser.findFirst.mockResolvedValueOnce(null);
    expect(await trocar({ atual: SENHA_ATUAL, senha: SENHA_NOVA, confirmacao: SENHA_NOVA })).toEqual({
      erro: "Sessão expirada. Entre de novo no portal.",
    });
    expect(portalUser.update).not.toHaveBeenCalled();
  });

  it("cinco erros seguidos travam a conferência da senha atual — nem a certa passa", async () => {
    for (let i = 0; i < 5; i++) await trocar({ atual: `errada-${i}`, senha: SENHA_NOVA, confirmacao: SENHA_NOVA });
    verifyPassword.mockClear();

    expect(await trocar({ atual: SENHA_ATUAL, senha: SENHA_NOVA, confirmacao: SENHA_NOVA })).toEqual({
      erro: "Muitas tentativas. Tente de novo em alguns minutos.",
    });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(portalUser.update).not.toHaveBeenCalled();
  });
});

describe("enviarLinkParaCriarSenha", () => {
  it("manda o link desta conta para o e-mail dela, pelo escritório dela", async () => {
    expect(await enviarLinkParaCriarSenha()).toEqual({ enviadoPara: "cliente@exemplo.com" });
    expect(createPasswordResetToken).toHaveBeenCalledWith(contaId, "PORTAL_USER");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      tenantId: "escritorio-a",
      to: "cliente@exemplo.com",
      resetToken: `token-de-${contaId}`,
      destino: "portal",
    });
  });

  it("e-mail que não sai vira erro na tela", async () => {
    sendPasswordResetEmail.mockResolvedValueOnce({ ok: false });
    expect(await enviarLinkParaCriarSenha()).toEqual({
      erro: expect.stringContaining("O e-mail não saiu"),
    });
  });

  it("três links em seguida: o quarto espera", async () => {
    for (let i = 0; i < 3; i++) await enviarLinkParaCriarSenha();
    sendPasswordResetEmail.mockClear();
    expect(await enviarLinkParaCriarSenha()).toEqual({ erro: expect.stringContaining("Já mandamos o link") });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
