import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Acessos do portal. 13/10/2026: e-mail repetido diz a verdade e oferece
// reaproveitar; excluir de verdade só para ADMIN/SUPER_ADMIN, com o nome
// digitado e o retrato na auditoria. 14/10/2026: o acesso é ligado direto a
// empresas (era a um Cliente) — criar, editar, ligar e desligar empresa, com a
// auditoria de cada uma. Tudo dentro do escritório de quem pede.

const m = vi.hoisted(() => {
  const db = {
    portalUser: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    portalUserCompany: { findUnique: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
    company: { findMany: vi.fn(), findFirst: vi.fn() },
    portalApprovalLimit: { updateMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    tutorialVisto: { deleteMany: vi.fn() },
    tenantSmtpConfig: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, subscriptionReadOnly: false },
    logAudit: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    ligadas: vi.fn(),
    alcance: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: async () => "hash-aleatorio" }));
vi.mock("@/lib/auth/passwordReset", () => ({ createPasswordResetToken: async () => "token-de-teste" }));
vi.mock("@/lib/email/sendMail", () => ({ sendPasswordResetEmail: m.sendPasswordResetEmail }));
vi.mock("@/lib/portal/empresasDaContaDb", () => ({
  empresasLigadasDasContas: async (_t: string, contas: { id: string }[]) => new Map(contas.map((c) => [c.id, m.ligadas(c.id) ?? []])),
  idsDasEmpresasDaConta: m.alcance,
}));

const {
  criarAcessoDoPortal,
  editarAcessoDoPortal,
  excluirAcessoDoPortal,
  resumoDoAcessoParaExcluir,
  ligarEmpresaAoAcesso,
  desligarEmpresaDoAcesso,
} = await import("./actions");

const IRRIGA = { id: "emp-irriga", name: "IRRIGA FOUR", displayName: null };
const BLD = { id: "emp-bld", name: "BLD MATRIZ", displayName: null };
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
const ligada = (e: { id: string; name: string }, incluiFiliais = true) => ({ id: e.id, nome: e.name, incluiFiliais, filiais: 0 });

function formulario(campos: Record<string, string>, empresas: { companyId: string; incluiFiliais?: boolean }[] = [{ companyId: IRRIGA.id }]) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  form.set("empresas", JSON.stringify(empresas));
  return form;
}

const acoes = () => m.logAudit.mock.calls.map((c) => c[0].action);

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx.role = "ADMIN";
  m.ctx.subscriptionReadOnly = false;
  m.db.$transaction.mockImplementation(async (fn: (tx: typeof m.db) => unknown) => fn(m.db));
  m.ligadas.mockReturnValue([]);
  m.alcance.mockResolvedValue(["emp-irriga"]);
  m.db.portalUser.findFirst.mockResolvedValue(null);
  m.db.portalUser.create.mockResolvedValue({ id: "pu-novo" });
  m.db.portalUser.deleteMany.mockResolvedValue({ count: 1 });
  m.db.company.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    [IRRIGA, BLD].filter((e) => args.where.id.in.includes(e.id))
  );
  m.db.company.findFirst.mockResolvedValue(IRRIGA);
  m.db.portalUserCompany.findUnique.mockResolvedValue(null);
  m.db.portalUserCompany.deleteMany.mockResolvedValue({ count: 1 });
  m.db.portalApprovalLimit.updateMany.mockResolvedValue({ count: 0 });
  m.db.tenantSmtpConfig.findUnique.mockResolvedValue({ tenantId: "escritorio-a" });
  m.sendPasswordResetEmail.mockResolvedValue({ ok: true });
});

describe("criarAcessoDoPortal — o acesso nasce ligado às empresas, sem Cliente", () => {
  it("cria com as empresas escolhidas (com e sem filiais), manda o link e audita as empresas", async () => {
    const r = await criarAcessoDoPortal(
      null,
      formulario({ nome: "Ana", email: "Ana@Cliente.com" }, [
        { companyId: IRRIGA.id },
        { companyId: BLD.id, incluiFiliais: false },
      ])
    );
    expect(r).toEqual({ ok: true });
    expect(m.db.portalUser.create).toHaveBeenCalledWith({
      data: {
        tenantId: "escritorio-a",
        name: "Ana",
        email: "ana@cliente.com",
        passwordHash: "hash-aleatorio",
        empresas: {
          create: [
            { tenantId: "escritorio-a", companyId: IRRIGA.id, incluiFiliais: true },
            { tenantId: "escritorio-a", companyId: BLD.id, incluiFiliais: false },
          ],
        },
      },
      select: { id: true },
    });
    // Sem cliente nenhum na conta nova.
    expect(m.db.portalUser.create.mock.calls[0]![0].data).not.toHaveProperty("clientGroupId");
    expect(m.sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@cliente.com", destino: "portal" }));
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "portal.user.created",
        metadata: {
          nome: "Ana",
          email: "ana@cliente.com",
          empresas: [
            { id: IRRIGA.id, nome: "IRRIGA FOUR", incluiFiliais: true },
            { id: BLD.id, nome: "BLD MATRIZ", incluiFiliais: false },
          ],
        },
      })
    );
  });

  it("empresa de outro escritório (não volta na busca do escritório): recusa, sem criar", async () => {
    const r = await criarAcessoDoPortal(null, formulario({ nome: "Ana", email: "ana@cliente.com" }, [{ companyId: "emp-de-outro" }]));
    expect(r).toEqual({ erro: "Empresa não encontrada." });
    expect(m.db.company.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "escritorio-a", id: { in: ["emp-de-outro"] } } }));
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
  });

  it("sem empresa: pede ao menos uma", async () => {
    const r = await criarAcessoDoPortal(null, formulario({ nome: "Ana", email: "ana@cliente.com" }, []));
    expect(r).toEqual({ erro: "Escolha ao menos uma empresa que esta conta enxerga." });
  });

  it("colaborador e coordenação de setor não criam", async () => {
    m.ctx.role = "SECTOR_ADMIN";
    expect(await criarAcessoDoPortal(null, formulario({ nome: "Ana", email: "ana@cliente.com" }))).toEqual({ erro: "Sem permissão." });
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
  });
});

describe("criarAcessoDoPortal — e-mail que já tem acesso", () => {
  const desativado = { id: "pu-antigo", name: "Maria", active: false };

  it("diz que o acesso existe, que está desativado e o que ele via — e não cria outro", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(desativado);
    m.ligadas.mockReturnValue([ligada({ id: "emp-antiga", name: "Empresa Antiga" })]);
    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria Silva", email: "Maria@Exemplo.com" }));

    expect(r).toMatchObject({
      erro: expect.stringContaining("desativado"),
      existente: { id: "pu-antigo", ativo: false, empresaIds: ["emp-antiga"], empresas: ["Empresa Antiga"], email: "maria@exemplo.com" },
    });
    expect(r && "erro" in r && r.erro).toContain("Empresa Antiga");
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
    // A busca é no escritório de quem pede.
    expect(m.db.portalUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "escritorio-a", email: "maria@exemplo.com" } }));
  });

  it("reaproveitar o desativado: reativa com o nome novo e SÓ as escolhidas, desliga as alçadas de fora e manda o link", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(desativado);
    m.ligadas.mockReturnValue([ligada({ id: "emp-antiga", name: "Empresa Antiga" })]);
    m.db.portalApprovalLimit.updateMany.mockResolvedValueOnce({ count: 2 });

    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria Silva", email: "maria@exemplo.com", reaproveitar: "pu-antigo" }));

    expect(r).toMatchObject({ ok: true });
    expect(m.db.portalUser.update).toHaveBeenCalledWith({ where: { id: "pu-antigo" }, data: { name: "Maria Silva", active: true } });
    expect(m.db.portalUserCompany.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "escritorio-a", portalUserId: "pu-antigo", companyId: { notIn: [IRRIGA.id] } },
    });
    expect(m.db.portalUserCompany.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { tenantId: "escritorio-a", portalUserId: "pu-antigo", companyId: IRRIGA.id, incluiFiliais: true } })
    );
    expect(m.db.portalApprovalLimit.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "escritorio-a", portalUserId: "pu-antigo", active: true, companyId: { notIn: ["emp-irriga"] } },
      data: { active: false },
    });
    expect(m.db.portalUser.create).not.toHaveBeenCalled();
    expect(m.sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "maria@exemplo.com", destino: "portal" }));
    expect(acoes()).toEqual(["portal.user.enabled", "portal.user.company.linked", "portal.user.company.unlinked"]);
    expect(m.logAudit.mock.calls[0]![0].metadata).toMatchObject({ reativado: true, alcadasDesligadas: 2, empresasAntes: ["Empresa Antiga"] });
  });

  it("reaproveitar o ativo: só liga as escolhidas que faltam, sem tirar nada nem reativar", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce({ ...desativado, active: true });
    m.ligadas.mockReturnValue([ligada(BLD)]);

    const r = await criarAcessoDoPortal(
      null,
      formulario({ nome: "Maria", email: "maria@exemplo.com", reaproveitar: "pu-antigo" }, [{ companyId: BLD.id }, { companyId: IRRIGA.id }])
    );

    expect(r).toMatchObject({ ok: true, mensagem: "Maria passa a ver também IRRIGA FOUR." });
    expect(m.db.portalUserCompany.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: "escritorio-a", portalUserId: "pu-antigo", companyId: IRRIGA.id, incluiFiliais: true }],
      skipDuplicates: true,
    });
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
    expect(m.db.portalUserCompany.deleteMany).not.toHaveBeenCalled();
    expect(acoes()).toEqual(["portal.user.company.linked"]);
  });

  it("reaproveitar com id que não é o dono do e-mail: não mexe em nada", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(desativado);
    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria", email: "maria@exemplo.com", reaproveitar: "pu-de-outro-escritorio" }));
    expect(r).toMatchObject({ erro: expect.stringContaining("mudou") });
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("ativo e já vendo as escolhidas: avisa, sem oferecer nada, e reaproveitar não faz nada", async () => {
    m.db.portalUser.findFirst.mockResolvedValue({ ...desativado, active: true });
    m.ligadas.mockReturnValue([ligada(IRRIGA)]);

    const r = await criarAcessoDoPortal(null, formulario({ nome: "Maria", email: "maria@exemplo.com" }));
    expect(r && "erro" in r && r.erro).toContain("já vê esta empresa");

    const r2 = await criarAcessoDoPortal(null, formulario({ nome: "Maria", email: "maria@exemplo.com", reaproveitar: "pu-antigo" }));
    expect(r2).toMatchObject({ erro: expect.stringContaining("já vê esta empresa") });
    expect(m.db.portalUserCompany.createMany).not.toHaveBeenCalled();
  });
});

describe("editarAcessoDoPortal", () => {
  const conta = { id: "pu-1", name: "Maria", email: "maria@exemplo.com" };

  it("e-mail que já é de outro acesso: diz de quem é e o que vê, e não salva", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(conta).mockResolvedValueOnce({ id: "pu-2", name: "João", active: false });
    m.ligadas.mockImplementation((id: string) => (id === "pu-2" ? [ligada(BLD)] : []));

    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria", email: "joao@exemplo.com" }));
    expect(r && "erro" in r && r.erro).toContain("João (desativado, que vê BLD MATRIZ)");
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("troca de empresas: tira a que saiu, liga a nova, desliga as alçadas de fora e audita cada uma", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(conta);
    m.ligadas.mockReturnValue([ligada(BLD)]);
    m.db.portalApprovalLimit.updateMany.mockResolvedValueOnce({ count: 1 });

    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria S.", email: "maria@exemplo.com" }));

    expect(r).toEqual({
      ok: true,
      mensagem: "Acesso atualizado. Maria S. deixa de ver BLD MATRIZ. Um limite de aprovação de pagamento foi desligado.",
    });
    expect(m.db.portalUser.update).toHaveBeenCalledWith({ where: { id: "pu-1" }, data: { name: "Maria S.", email: "maria@exemplo.com" } });
    expect(m.db.portalUserCompany.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "escritorio-a", portalUserId: "pu-1", companyId: { in: [BLD.id] } },
    });
    expect(m.db.portalUserCompany.upsert).toHaveBeenCalledTimes(1);
    expect(m.db.portalApprovalLimit.updateMany).toHaveBeenCalled();
    expect(acoes()).toEqual(["portal.user.updated", "portal.user.company.linked", "portal.user.company.unlinked"]);
  });

  it("só o \"incluir filiais\" mudou: grava a ligação e audita a mudança, sem tirar nem pôr empresa", async () => {
    m.db.portalUser.findFirst.mockResolvedValueOnce(conta);
    m.ligadas.mockReturnValue([ligada(IRRIGA, true)]);
    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria", email: "maria@exemplo.com" }, [{ companyId: IRRIGA.id, incluiFiliais: false }]));
    expect(r).toEqual({ ok: true, mensagem: "Acesso atualizado." });
    expect(m.db.portalUserCompany.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { incluiFiliais: false } }));
    expect(acoes()).toEqual(["portal.user.company.filiais"]);
  });

  it("acesso de outro escritório não é encontrado", async () => {
    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-x", nome: "Maria", email: "maria@exemplo.com" }));
    expect(r).toEqual({ erro: "Acesso não encontrado." });
    expect(m.db.portalUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pu-x", tenantId: "escritorio-a" } }));
    expect(m.db.portalUser.update).not.toHaveBeenCalled();
  });

  it("sem permissão de administrador, não edita", async () => {
    m.ctx.role = "SECTOR_ADMIN";
    const r = await editarAcessoDoPortal(null, formulario({ id: "pu-1", nome: "Maria", email: "maria@exemplo.com" }));
    expect(r).toEqual({ erro: "Sem permissão." });
    expect(m.db.portalUser.findFirst).not.toHaveBeenCalled();
  });
});

describe("ligar e desligar empresa — a aba \"Acesso ao portal\" da ficha", () => {
  beforeEach(() => {
    m.db.portalUser.findFirst.mockResolvedValue({ id: "pu-1", name: "Maria" });
  });

  it("ligar um acesso existente à empresa: cria a ligação e audita", async () => {
    expect(await ligarEmpresaAoAcesso("pu-1", IRRIGA.id, true)).toEqual({ ok: true, mensagem: "Maria passa a ver IRRIGA FOUR no portal." });
    expect(m.db.portalUserCompany.upsert).toHaveBeenCalledWith({
      where: { portalUserId_companyId: { portalUserId: "pu-1", companyId: IRRIGA.id } },
      create: { tenantId: "escritorio-a", portalUserId: "pu-1", companyId: IRRIGA.id, incluiFiliais: true },
      update: { incluiFiliais: true },
    });
    expect(m.db.portalApprovalLimit.updateMany).not.toHaveBeenCalled();
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "portal.user.company.linked",
        entityType: "PortalUser",
        entityId: "pu-1",
        metadata: { nome: "Maria", empresa: { id: IRRIGA.id, nome: "IRRIGA FOUR" }, incluiFiliais: true },
      })
    );
  });

  it("tirar as filiais: grava, desliga as alçadas de fora e audita a mudança", async () => {
    m.db.portalUserCompany.findUnique.mockResolvedValueOnce({ incluiFiliais: true });
    expect(await ligarEmpresaAoAcesso("pu-1", IRRIGA.id, false)).toMatchObject({ ok: true });
    expect(m.db.portalApprovalLimit.updateMany).toHaveBeenCalled();
    expect(acoes()).toEqual(["portal.user.company.filiais"]);
  });

  it("já estava assim: nada muda, nada é gravado", async () => {
    m.db.portalUserCompany.findUnique.mockResolvedValueOnce({ incluiFiliais: true });
    expect(await ligarEmpresaAoAcesso("pu-1", IRRIGA.id, true)).toMatchObject({ ok: true, mensagem: expect.stringContaining("Nada mudou") });
    expect(m.db.portalUserCompany.upsert).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("empresa ou acesso de outro escritório: não é encontrado", async () => {
    m.db.company.findFirst.mockResolvedValueOnce(null);
    expect(await ligarEmpresaAoAcesso("pu-1", "emp-de-outro", true)).toEqual({ erro: "Acesso ou empresa não encontrado." });
    expect(m.db.company.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "emp-de-outro", tenantId: "escritorio-a" } }));
    expect(m.db.portalUserCompany.upsert).not.toHaveBeenCalled();
  });

  it("desligar: tira só a ligação (a conta continua), desliga as alçadas de fora e audita", async () => {
    const r = await desligarEmpresaDoAcesso("pu-1", IRRIGA.id);
    expect(r).toEqual({ ok: true, mensagem: "Maria deixa de ver IRRIGA FOUR no portal. O acesso continua." });
    expect(m.db.portalUserCompany.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a", portalUserId: "pu-1", companyId: IRRIGA.id } });
    expect(m.db.portalUser.deleteMany).not.toHaveBeenCalled();
    expect(m.db.portalApprovalLimit.updateMany).toHaveBeenCalled();
    expect(acoes()).toEqual(["portal.user.company.unlinked"]);
  });

  it("desligar empresa que só vem pela matriz: explica, sem gravar", async () => {
    m.db.portalUserCompany.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await desligarEmpresaDoAcesso("pu-1", IRRIGA.id)).toEqual({ erro: "Esta empresa não está ligada direto a este acesso." });
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("sem permissão, nada muda", async () => {
    m.ctx.role = "SECTOR_USER";
    expect(await ligarEmpresaAoAcesso("pu-1", IRRIGA.id, true)).toEqual({ erro: "Sem permissão." });
    expect(await desligarEmpresaDoAcesso("pu-1", IRRIGA.id)).toEqual({ erro: "Sem permissão." });
    expect(m.db.portalUserCompany.upsert).not.toHaveBeenCalled();
  });
});

describe("excluirAcessoDoPortal", () => {
  const conta = {
    id: "pu-1",
    name: "Maria Teste",
    email: "maria@exemplo.com",
    active: false,
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

  it("exclui numa transação, com o token de senha, e deixa o retrato na auditoria — com as empresas", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    m.ligadas.mockReturnValue([ligada(IRRIGA)]);
    m.ctx.role = "SUPER_ADMIN";

    expect(await excluirAcessoDoPortal("pu-1", "  maria teste ")).toEqual({ ok: true });

    expect(m.db.$transaction).toHaveBeenCalledTimes(1);
    expect(m.db.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "pu-1", subject: "PORTAL_USER" } });
    expect(m.db.portalUser.deleteMany).toHaveBeenCalledWith({ where: { id: "pu-1", tenantId: "escritorio-a" } });
    // As ligações com as empresas saem com a conta (CASCADE): nada à mão.
    expect(m.db.portalUserCompany.deleteMany).not.toHaveBeenCalled();
    // A marca do tutorial do primeiro acesso sai junto, só a do portal e do escritório.
    expect(m.db.tutorialVisto.deleteMany).toHaveBeenCalledWith({
      where: { subject: "PORTAL_USER", tenantId: "escritorio-a", userId: { in: ["pu-1"] } },
    });
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
        empresas: [{ id: IRRIGA.id, nome: "IRRIGA FOUR", incluiFiliais: true }],
        historico: conta._count,
      },
    });
  });

  it("a marca do tutorial sem a tabela (deploy antes da migration) não desfaz a exclusão", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    m.db.tutorialVisto.deleteMany.mockRejectedValueOnce(Object.assign(new Error("sem tabela"), { code: "P2021" }));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await excluirAcessoDoPortal("pu-1", "Maria Teste")).toEqual({ ok: true });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "portal.user.deleted" }));
  });

  it("o e-mail também confirma", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    expect(await excluirAcessoDoPortal("pu-1", "MARIA@exemplo.com")).toEqual({ ok: true });
  });

  it("a contagem separa o que fica (sem o nome) do que sai junto, e diz o que o acesso vê", async () => {
    m.db.portalUser.findFirst.mockResolvedValue(conta);
    m.ligadas.mockReturnValue([ligada(IRRIGA), ligada(BLD)]);
    expect(await resumoDoAcessoParaExcluir("pu-1")).toEqual({
      nome: "Maria Teste",
      email: "maria@exemplo.com",
      empresas: "vê IRRIGA FOUR e BLD MATRIZ",
      historico: { ficam: ["3 mensagens"], apagados: ["1 limite de aprovação de pagamento"] },
    });
  });
});
