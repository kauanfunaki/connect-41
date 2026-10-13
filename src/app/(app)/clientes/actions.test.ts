import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Cliente (13/10/2026): exclusão de verdade só para ADMIN/SUPER_ADMIN, com o
// nome digitado; os acessos do portal saem junto, as empresas ficam sem
// cliente. Vincular e desvincular empresas pelo cliente, sempre dentro do
// escritório de quem pede.

const m = vi.hoisted(() => {
  const db = {
    clientGroup: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    portalUser: { deleteMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    company: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, sectors: [] as string[], subscriptionReadOnly: false },
    logAudit: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/scope", () => ({ scopedCompanyWhere: async (c: { tenantId: string }) => ({ tenantId: c.tenantId }) }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

const { excluirCliente, resumoDoClienteParaExcluir, vincularEmpresasAoCliente, desvincularEmpresaDoCliente, criarCliente, empresasComARaiz } =
  await import("./actions");

const IRRIGA = {
  id: "g-irriga",
  name: "IRRIGA FOUR",
  cnpjRoot: "12345678",
  active: true,
  companies: [
    { id: "emp-1", name: "IRRIGA FOUR LTDA", displayName: null },
    { id: "emp-2", name: "IRRIGA FOUR FILIAL", displayName: "IRRIGA SP" },
  ],
  portalUsers: [{ id: "pu-1", name: "Maria", email: "maria@exemplo.com", active: true }],
  _count: { announcements: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx.role = "ADMIN";
  m.ctx.subscriptionReadOnly = false;
  m.db.$transaction.mockImplementation(async (fn: (tx: typeof m.db) => unknown) => fn(m.db));
  m.db.clientGroup.findFirst.mockResolvedValue(IRRIGA);
  m.db.company.updateMany.mockResolvedValue({ count: 0 });
});

describe("excluirCliente", () => {
  it.each(["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[])("%s não exclui nem vê a contagem", async (papel) => {
    m.ctx.role = papel;
    expect(await excluirCliente("g-irriga", "IRRIGA FOUR", ["pu-1"])).toEqual({ erro: "Só administradores excluem clientes." });
    expect(await resumoDoClienteParaExcluir("g-irriga")).toEqual({ erro: "Só administradores excluem clientes." });
    expect(m.db.clientGroup.findFirst).not.toHaveBeenCalled();
    expect(m.db.clientGroup.delete).not.toHaveBeenCalled();
  });

  it("nome digitado que não confere: não exclui", async () => {
    expect(await excluirCliente("g-irriga", "IRRIGA", ["pu-1"])).toEqual({ erro: expect.stringContaining("não confere") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("cliente de outro escritório: não é encontrado", async () => {
    m.db.clientGroup.findFirst.mockResolvedValueOnce(null);
    expect(await excluirCliente("g-de-outro", "Qualquer", [])).toEqual({ erro: "Cliente não encontrado." });
    expect(m.db.clientGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g-de-outro", tenantId: "escritorio-a" } }));
    expect(m.db.clientGroup.delete).not.toHaveBeenCalled();
  });

  it("lista de acessos diferente da que a janela mostrou: para, sem excluir", async () => {
    expect(await excluirCliente("g-irriga", "IRRIGA FOUR", [])).toEqual({ erro: expect.stringContaining("mudaram") });
    expect(await excluirCliente("g-irriga", "IRRIGA FOUR", ["pu-outro"])).toEqual({ erro: expect.stringContaining("mudaram") });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("com histórico: exclui os acessos, deixa as empresas sem cliente e grava o retrato", async () => {
    expect(await excluirCliente("g-irriga", "irriga four", ["pu-1"])).toEqual({ ok: true });

    expect(m.db.$transaction).toHaveBeenCalledTimes(1);
    expect(m.db.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ["pu-1"] }, subject: "PORTAL_USER" } });
    expect(m.db.portalUser.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["pu-1"] }, tenantId: "escritorio-a", clientGroupId: "g-irriga" },
    });
    // As empresas não são excluídas: só perdem o cliente.
    expect(m.db.company.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "escritorio-a", clientGroupId: "g-irriga" },
      data: { clientGroupId: null },
    });
    expect(m.db.clientGroup.delete).toHaveBeenCalledWith({ where: { id: "g-irriga" } });

    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "clientGroup.delete",
        entityType: "ClientGroup",
        entityId: "g-irriga",
        metadata: expect.objectContaining({
          nome: "IRRIGA FOUR",
          empresasSemCliente: [
            { id: "emp-1", nome: "IRRIGA FOUR LTDA" },
            { id: "emp-2", nome: "IRRIGA SP" },
          ],
          acessosExcluidos: [{ id: "pu-1", nome: "Maria", email: "maria@exemplo.com", ativo: true }],
          comunicados: 2,
        }),
      })
    );
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "portal.user.deleted", entityId: "pu-1" }));
  });

  it("sem histórico: só o cliente sai", async () => {
    m.db.clientGroup.findFirst.mockResolvedValueOnce({ ...IRRIGA, companies: [], portalUsers: [], _count: { announcements: 0 } });
    expect(await excluirCliente("g-irriga", "IRRIGA FOUR", [])).toEqual({ ok: true });
    expect(m.db.portalUser.deleteMany).not.toHaveBeenCalled();
    expect(m.db.clientGroup.delete).toHaveBeenCalledWith({ where: { id: "g-irriga" } });
  });

  it("acesso criado no meio do caminho (FK RESTRICT): volta atrás e explica", async () => {
    m.db.clientGroup.delete.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "P2003" }));
    expect(await excluirCliente("g-irriga", "IRRIGA FOUR", ["pu-1"])).toEqual({ erro: expect.stringContaining("acesso do portal novo") });
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("o resumo lista empresas e acessos para a janela", async () => {
    expect(await resumoDoClienteParaExcluir("g-irriga")).toEqual({
      nome: "IRRIGA FOUR",
      raiz: "12345678",
      empresas: [
        { id: "emp-1", nome: "IRRIGA FOUR LTDA" },
        { id: "emp-2", nome: "IRRIGA SP" },
      ],
      acessos: [{ id: "pu-1", nome: "Maria", email: "maria@exemplo.com", ativo: true }],
      comunicados: 2,
    });
  });
});

describe("vincularEmpresasAoCliente", () => {
  it("move para o cliente, inclusive a que estava em outro, e registra de onde veio", async () => {
    m.db.company.findMany.mockResolvedValueOnce([
      { id: "emp-1", name: "IRRIGA FOUR LTDA", displayName: null, clientGroupId: null, clientGroup: null },
      { id: "emp-3", name: "IRRIGA NORTE", displayName: null, clientGroupId: "g-outro", clientGroup: { name: "Outro" } },
    ]);

    expect(await vincularEmpresasAoCliente("g-irriga", ["emp-1", "emp-3", "emp-1"])).toEqual({ ok: true, vinculadas: 2, movidas: 1 });
    expect(m.db.company.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["emp-1", "emp-3"] }, tenantId: "escritorio-a" } }));
    expect(m.db.company.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["emp-1", "emp-3"] }, tenantId: "escritorio-a" },
      data: { clientGroupId: "g-irriga" },
    });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "clientGroup.companies.linked",
        metadata: expect.objectContaining({
          empresas: [
            { id: "emp-1", nome: "IRRIGA FOUR LTDA", deCliente: null },
            { id: "emp-3", nome: "IRRIGA NORTE", deCliente: { id: "g-outro", nome: "Outro" } },
          ],
        }),
      })
    );
  });

  it("empresa de outro escritório (não volta na busca do tenant): não vincula nenhuma", async () => {
    m.db.company.findMany.mockResolvedValueOnce([{ id: "emp-1", name: "A", displayName: null, clientGroupId: null, clientGroup: null }]);
    expect(await vincularEmpresasAoCliente("g-irriga", ["emp-1", "emp-de-outro"])).toEqual({ erro: expect.stringContaining("não foi encontrada") });
    expect(m.db.company.updateMany).not.toHaveBeenCalled();
  });

  it("cliente de outro escritório: recusa", async () => {
    m.db.clientGroup.findFirst.mockResolvedValueOnce(null);
    expect(await vincularEmpresasAoCliente("g-de-outro", ["emp-1"])).toEqual({ erro: "Cliente não encontrado." });
    expect(m.db.company.updateMany).not.toHaveBeenCalled();
  });

  it("quem não escreve cadastro (colaborador, diretoria) não vincula", async () => {
    for (const papel of ["SECTOR_USER", "READONLY"] as UserRole[]) {
      m.ctx.role = papel;
      expect(await vincularEmpresasAoCliente("g-irriga", ["emp-1"])).toEqual({ erro: "Sem permissão." });
    }
    expect(m.db.company.updateMany).not.toHaveBeenCalled();
  });
});

describe("desvincularEmpresaDoCliente", () => {
  it("tira só do cliente indicado, no escritório de quem pede", async () => {
    m.db.company.findFirst.mockResolvedValueOnce({ id: "emp-1", name: "IRRIGA FOUR LTDA", displayName: null, clientGroup: { name: "IRRIGA FOUR" } });
    expect(await desvincularEmpresaDoCliente("g-irriga", "emp-1")).toEqual({ ok: true });
    expect(m.db.company.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "emp-1", clientGroupId: "g-irriga", tenantId: "escritorio-a" } }));
    expect(m.db.company.updateMany).toHaveBeenCalledWith({
      where: { id: "emp-1", tenantId: "escritorio-a", clientGroupId: "g-irriga" },
      data: { clientGroupId: null },
    });
  });

  it("empresa que não está no cliente: não mexe", async () => {
    m.db.company.findFirst.mockResolvedValueOnce(null);
    expect(await desvincularEmpresaDoCliente("g-irriga", "emp-9")).toEqual({ erro: expect.stringContaining("já não está") });
    expect(m.db.company.updateMany).not.toHaveBeenCalled();
  });
});

describe("criarCliente com as empresas da raiz", () => {
  it("cria e vincula as empresas marcadas na mesma transação, só do escritório", async () => {
    m.db.clientGroup.create.mockResolvedValueOnce({ id: "g-novo" });
    m.db.company.updateMany.mockResolvedValueOnce({ count: 2 });
    const form = new FormData();
    form.set("name", "IRRIGA FOUR");
    form.set("cnpjRoot", "12.345.678");
    form.append("empresaIds", "emp-1");
    form.append("empresaIds", "emp-2");

    await expect(criarCliente(null, form)).rejects.toThrow("REDIRECT:/clientes");
    expect(m.db.$transaction).toHaveBeenCalledTimes(1);
    expect(m.db.clientGroup.create).toHaveBeenCalledWith({
      data: { tenantId: "escritorio-a", name: "IRRIGA FOUR", cnpjRoot: "12345678", active: false },
    });
    expect(m.db.company.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["emp-1", "emp-2"] }, tenantId: "escritorio-a" },
      data: { clientGroupId: "g-novo" },
    });
  });
});

describe("empresasComARaiz", () => {
  it("acha com e sem máscara, e confere a raiz exata", async () => {
    m.db.company.findMany.mockResolvedValueOnce([
      { id: "emp-1", name: "A", displayName: null, cnpj: "12.345.678/0001-90", clientGroupId: null, clientGroup: null },
      { id: "emp-2", name: "B", displayName: null, cnpj: "12345678000270", clientGroupId: "g-x", clientGroup: { name: "X" } },
      { id: "emp-3", name: "C", displayName: null, cnpj: "1234567800", clientGroupId: null, clientGroup: null },
    ]);
    expect(await empresasComARaiz("12.345.678")).toEqual([
      { id: "emp-1", nome: "A", cnpj: "12.345.678/0001-90", clienteAtual: null },
      { id: "emp-2", nome: "B", cnpj: "12345678000270", clienteAtual: "X" },
    ]);
    expect(m.db.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "escritorio-a", OR: [{ cnpj: { startsWith: "12345678" } }, { cnpj: { startsWith: "12.345.678" } }] },
      })
    );
  });

  it("raiz incompleta não consulta", async () => {
    expect(await empresasComARaiz("1234")).toEqual([]);
    expect(m.db.company.findMany).not.toHaveBeenCalled();
  });
});
