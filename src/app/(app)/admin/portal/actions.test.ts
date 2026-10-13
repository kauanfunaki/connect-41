import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Acessos do portal (13/10/2026): e-mail repetido diz a verdade e oferece
// reaproveitar; editar troca nome, e-mail e cliente; excluir de verdade só
// para ADMIN/SUPER_ADMIN, com o nome digitado e o retrato na auditoria. Tudo
// dentro do escritório de quem pede.

const m = vi.hoisted(() => {
  const db = {
    clientGroup: { findFirst: vi.fn() },
    portalUser: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    company: { findMany: vi.fn() },
    portalApprovalLimit: { updateMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    tenantSmtpConfig: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, subscriptionReadOnly: false },
    logAudit: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: async () => "hash-aleatorio" }));
vi.mock("@/lib/auth/passwordReset", () => ({ createPasswordResetToken: async () => "token-de-teste" }));
vi.mock("@/lib/email/sendMail", () => ({ sendPasswordResetEmail: m.sendPasswordResetEmail }));

const { criarAcessoDoPortal, editarAcessoDoPortal, excluirAcessoDoPortal, resumoDoAcessoParaExcluir } = await import("./actions");

const IRRIGA = { id: "g-irriga", name: "IRRIGA FOUR" };
const contagemZerada = {
  clientRequestMessages: 0,
  companyMessages: 0,
  serviceRequestMessages: 0,
  processMessages: 0,
  serviceRequestsOpened: 0,
  clientRequestAttachments: 0,
  serviceRequestAttachments: 0,
  processDocuments: 0,
  driveFilesEnviados: 0,
  financeApprovalEvents: 0,
  driveAcessos: 0,
  approvalLimits: 0,
  announcementReads: 0,
  pushSubscriptions: 0,
};

function formulario(campos: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx.role = "ADMIN";
  m.ctx.subscriptionReadOnly = false;
  m.db.$transaction.mockImplementation(async (fn: (tx: typeof m.db) => unknown) => fn(m.db));
  m.db.clientGroup.findFirst.mockResolvedValue(IRRIGA);
  m.db.portalUser.findFirst.mockResolvedValue(null);
  m.db.portalUser.create.mockResolvedValue({ id: "pu-novo" });
  m.db.portalUser.deleteMany.mockResolvedValue({ count: 1 });
  m.db.company.findMany.mockResolvedValue([{ id: "emp-irriga-1" }]);
  m.db.portalApprovalLimit.updateMany.mockResolvedValue({ count: 0 });
  m.db.tenantSmtpConfig.findUnique.mockResolvedValue({ tenantId: "escritorio-a" });
  m.sendPasswordResetEmail.mockResolvedValue({ ok: true });
});

describe("criarAcessoDoPortal — e-mail que já tem acesso", () => {
  const desativadoDeOutro = {
    id: "pu-antigo",
    name: "Maria",
    active: false,
    clientGroupId: "g-antigo",
    clientGroup: { name: "Cliente Antigo" },
  };

  it("diz que o acesso existe, que está desativado e de qual cliente é — e não cria outro", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(desativadoDeOutro);
    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria Silva", email: "Maria@Exemplo.com", clientGroupId: IRRIGA.id }));

    expect(r).toMatchObject({
      erro: expect.stringContaining("desativado"),
      existente: { id: "pu-antigo", ativo: false, cliente: "Cliente Antigo", clienteId: "g-antigo", email: "maria@exemplo.com" },
    });
    expect(r && "erro" in r && r.erro).toContain("Cliente Antigo");
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
    // A busca é no escritório de quem pede.
    expect(m.db.portalUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "escritorio-a", email: "maria@exemplo.com" } }));
  });

  it("reaproveitar: passa para o cliente escolhido, leva o nome novo, reativa e desliga as alçadas de fora", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(desativadoDeOutro);
    m.db.portalApprovalLimit.updateMany.mockResolvedValueOnce({ count: 2 });

    const r = await criarAcessoDoPortal(
      null,
      formulario({ nome: "Maria Silva", email: "maria@exemplo.com", clientGroupId: IRRIGA.id, reaproveitar: "pu-antigo" })
    );

    expect(r).toMatchObject({ ok: true });
    expect(m.db.portalUser.update).toHaveBeenCalledWith({
      where: { id: "pu-antigo" },
      data: { name: "Maria Silva", clientGroupId: IRRIGA.id, active: true },
    });
    expect(m.db.portalApprovalLimit.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "escritorio-a", portalUserId: "pu-antigo", active: true, companyId: { notIn: ["emp-irriga-1"] } },
      data: { active: false },
    });
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
    // Estava desativado: vai o link de senha, como no acesso novo.
    expect(m.sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "maria@exemplo.com", destino: "portal" }));
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "portal.user.reassigned",
        entityId: "pu-antigo",
        metadata: expect.objectContaining({ paraCliente: { id: IRRIGA.id, nome: IRRIGA.name }, reativado: true, alcadasDesligadas: 2 }),
      })
    );
  });

  it("reaproveitar com id que não é o dono do e-mail: não mexe em nada", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(desativadoDeOutro);
    const r = await criarAcessoDoPortal(
      null,
      formulario({ nome: "Maria", email: "maria@exemplo.com", clientGroupId: IRRIGA.id, reaproveitar: "pu-de-outro-escritorio" })
    );
    expect(r).toMatchObject({ erro: expect.stringContaining("mudou") });
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("ativo no mesmo cliente: avisa, sem oferecer nada, e reaproveitar não faz nada", async () => {
    const ativoAqui = { ...desativadoDeOutro, active: true, clientGroupId: IRRIGA.id, clientGroup: { name: IRRIGA.name } };
    m.db.portalUser.findFirst.mockResolvedValue(ativoAqui);

    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria", email: "maria@exemplo.com", clientGroupId: IRRIGA.id }));
    expect(r && "erro" in r && r.erro).toContain("ativo neste cliente");

    const r2 = await criarAcessoDoPortal(
      null,
      formulario({ nome: "Maria", email: "maria@exemplo.com", clientGroupId: IRRIGA.id, reaproveitar: "pu-antigo" })
    );
    expect(r2).toMatchObject({ erro: expect.stringContaining("ativo neste cliente") });
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("cliente de outro escritório: recusa antes de olhar o e-mail", async () => {
    m.db.clientGroup.findFirst.mockResolvedValueOnce(null);
    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria", email: "maria@exemplo.com", clientGroupId: "g-de-outro" }));
    expect(r).toEqual({ erro: "Cliente não encontrado." });
    expect(m.db.clientGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g-de-outro", tenantId: "escritorio-a" } }));
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
  });
});

describe("editarAcessoDoPortal", () => {
  const conta = { id: "pu-1", name: "Maria", email: "maria@exemplo.com", clientGroupId: "g-antigo", clientGroup: { name: "Cliente Antigo" } };

  it("e-mail que já é de outro acesso: diz de quem é, e não salva", async () => {
    m.db.portalUser.findFirst
      .mockResolvedValueOnce(conta)
      .mockResolvedValueOnce({ name: "João", active: false, clientGroup: { name: "Outro Cliente" } });

    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria", email: "joao@exemplo.com", clientGroupId: IRRIGA.id }));
    expect(r && "erro" in r && r.erro).toContain("João, do cliente Outro Cliente (desativado)");
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("trocar o cliente: grava, desliga as alçadas de fora e registra de onde para onde", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(conta);
    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria S.", email: "maria@exemplo.com", clientGroupId: IRRIGA.id }));

    expect(r).toMatchObject({ ok: true, mensagem: expect.stringContaining("entrar de novo") });
    expect(m.db.portalUser.update).toHaveBeenCalledWith({
      where: { id: "pu-1" },
      data: { name: "Maria S.", email: "maria@exemplo.com", clientGroupId: IRRIGA.id },
    });
    expect(m.db.portalApprovalLimit.updateMany).toHaveBeenCalled();
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "portal.user.reassigned" }));
  });

  it("acesso de outro escritório não é encontrado", async () => {
    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-x", nome: "Maria", email: "maria@exemplo.com", clientGroupId: IRRIGA.id }));
    expect(r).toEqual({ erro: "Acesso não encontrado." });
    expect(m.db.portalUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pu-x", tenantId: "escritorio-a" } }));
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("sem permissão de administrador, não edita", async () => {
    m.ctx.role = "SECTOR_ADMIN";
    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria", email: "maria@exemplo.com", clientGroupId: IRRIGA.id }));
    expect(r).toEqual({ erro: "Sem permissão." });
    expect(m.db.portalUser.findFirst).not.toHaveBeenCalled();
  });
});

describe("excluirAcessoDoPortal", () => {
  const conta = {
    id: "pu-1",
    name: "Maria Teste",
    email: "maria@exemplo.com",
    active: false,
    clientGroupId: "g-antigo",
    clientGroup: { name: "Cliente Antigo" },
    _count: { ...contagemZerada, clientRequestMessages: 3, approvalLimits: 1 },
  };

  it.each(["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[])("%s não exclui nem vê a contagem", async (papel) => {
    m.ctx.role = papel;
    m.db.portalUser.findFirst.mockResolvedValue(conta);

    expect(await excluirAcessoDoPortal("pu-1", "Maria Teste")).toEqual({ erro: expect.stringContaining("administradores") });
    expect(await resumoDoAcessoParaExcluir("pu-1")).toEqual({ erro: expect.stringContaining("administradores") });
    expect(m.db.portalUser.deleteMany).not.toHaveBeenCalled();
    expect(m.db.portalUser.findFirst).not.toHaveBeenCalled();
  });

  it("nome digitado que não confere: não exclui", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    const r = await excluirAcessoDoPortal("pu-1", "Maria");
    expect(r).toEqual({ erro: expect.stringContaining("não confere") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
    expect(m.db.portalUser.deleteMany).not.toHaveBeenCalled();
  });

  it("acesso de outro escritório: não é encontrado", async () => {
    const r = await excluirAcessoDoPortal("pu-de-outro", "Maria Teste");
    expect(r).toEqual({ erro: "Acesso não encontrado." });
    expect(m.db.portalUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pu-de-outro", tenantId: "escritorio-a" } }));
    expect(m.db.portalUser.deleteMany).not.toHaveBeenCalled();
  });

  it("exclui numa transação, com o token de senha, e deixa o retrato na auditoria", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    m.ctx.role = "SUPER_ADMIN";

    expect(await excluirAcessoDoPortal("pu-1", "  maria teste ")).toEqual({ ok: true });

    expect(m.db.$transaction).toHaveBeenCalledTimes(1);
    expect(m.db.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "pu-1", subject: "PORTAL_USER" } });
    expect(m.db.portalUser.deleteMany).toHaveBeenCalledWith({ where: { id: "pu-1", tenantId: "escritorio-a" } });
    expect(m.logAudit).toHaveBeenCalledWith({
      tenantId: "escritorio-a",
      userId: "admin-1",
      action: "portal.user.deleted",
      entityType: "PortalUser",
      entityId: "pu-1",
      metadata: {
        nome: "Maria Teste",
        email: "maria@exemplo.com",
        ativo: false,
        cliente: { id: "g-antigo", nome: "Cliente Antigo" },
        historico: conta._count,
      },
    });
  });

  it("o e-mail também confirma", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    expect(await excluirAcessoDoPortal("pu-1", "MARIA@exemplo.com")).toEqual({ ok: true });
  });

  it("a contagem separa o que fica (sem o nome) do que sai junto", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    expect(await resumoDoAcessoParaExcluir("pu-1")).toEqual({
      nome: "Maria Teste",
      email: "maria@exemplo.com",
      cliente: "Cliente Antigo",
      historico: { ficam: ["3 mensagens"], apagados: ["1 limite de aprovação de pagamento"] },
    });
  });
});
