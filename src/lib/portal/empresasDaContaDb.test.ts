import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: a leitura do banco do portal por empresa (14/10/2026) — que
// toda consulta leva o escritório e que o aviso só sai para acesso ativo. A
// volta para a regra do Cliente, sem a tabela nova, saiu em 21/10/2026.

const m = vi.hoisted(() => ({
  portalUserCompany: { findMany: vi.fn() },
  company: { findMany: vi.fn() },
  portalUser: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m }));

const { lerEmpresasDaConta, lerContasDasEmpresas, usuariosAtivosDasEmpresas, idsDasEmpresasDaConta } = await import("./empresasDaContaDb");

const semTabela = () => Object.assign(new Error("The table `portal_user_companies` does not exist"), { code: "P2021" });
const T = "escritorio-41";
const emp = (id: string, extra: Record<string, unknown> = {}) => ({ id, tenantId: T, parentCompanyId: null, status: "ACTIVE", ...extra });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lerEmpresasDaConta — o alcance do portal", () => {
  it("lê as ligações da conta no escritório, e as empresas (e filiais) só do escritório", async () => {
    m.portalUserCompany.findMany.mockResolvedValueOnce([
      { companyId: "matriz", incluiFiliais: true },
      { companyId: "solta", incluiFiliais: false },
    ]);
    m.company.findMany.mockResolvedValueOnce([emp("matriz"), emp("filial", { parentCompanyId: "matriz" }), emp("solta")]);

    expect(await idsDasEmpresasDaConta(T, "pu-1")).toEqual(["matriz", "filial", "solta"]);
    expect(m.portalUserCompany.findMany.mock.calls[0]![0].where).toEqual({ tenantId: T, portalUserId: "pu-1" });
    expect(m.company.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: T,
      OR: [{ id: { in: ["matriz", "solta"] } }, { parentCompanyId: { in: ["matriz"] } }],
    });
  });

  it("sem ligação: nada, e nem consulta as empresas", async () => {
    m.portalUserCompany.findMany.mockResolvedValueOnce([]);
    expect((await lerEmpresasDaConta(T, "pu-1")).size).toBe(0);
    expect(m.company.findMany).not.toHaveBeenCalled();
  });

  it("erro do banco sobe — inclusive a falta da tabela: não vira lista vazia nem a regra do Cliente", async () => {
    m.portalUserCompany.findMany.mockRejectedValueOnce(new Error("conexão caiu"));
    await expect(lerEmpresasDaConta(T, "pu-1")).rejects.toThrow("conexão caiu");
    m.portalUserCompany.findMany.mockRejectedValueOnce(semTabela());
    await expect(idsDasEmpresasDaConta(T, "pu-1")).rejects.toThrow("does not exist");
    expect(m.company.findMany).not.toHaveBeenCalled();
  });
});

describe("lerContasDasEmpresas / usuariosAtivosDasEmpresas — quem recebe aviso", () => {
  it("a filial avisa quem está ligado a ela e quem tem a matriz com as filiais", async () => {
    m.company.findMany
      .mockResolvedValueOnce([emp("filial", { parentCompanyId: "matriz" })]) // as empresas pedidas
      .mockResolvedValueOnce([{ id: "matriz", tenantId: T }]); // as matrizes
    m.portalUserCompany.findMany.mockResolvedValueOnce([
      { portalUserId: "ana", companyId: "matriz", incluiFiliais: true },
      { portalUserId: "caio", companyId: "filial", incluiFiliais: false },
    ]);
    const contas = await lerContasDasEmpresas(T, ["filial"]);
    expect([...contas.get("filial")!.keys()].sort()).toEqual(["ana", "caio"]);
    expect(m.portalUserCompany.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: T,
      OR: [{ companyId: { in: ["filial"] } }, { companyId: { in: ["matriz"] }, incluiFiliais: true }],
    });
  });

  it("só acesso ativo recebe, e uma vez só mesmo vendo várias das empresas", async () => {
    m.company.findMany.mockResolvedValueOnce([emp("a"), emp("b")]);
    m.portalUserCompany.findMany.mockResolvedValueOnce([
      { portalUserId: "ana", companyId: "a", incluiFiliais: true },
      { portalUserId: "ana", companyId: "b", incluiFiliais: true },
      { portalUserId: "bia", companyId: "b", incluiFiliais: true },
    ]);
    m.portalUser.findMany.mockResolvedValueOnce([{ id: "ana", name: "Ana", email: "ana@cliente.com" }]);

    expect(await usuariosAtivosDasEmpresas(T, ["a", "b"])).toEqual([{ id: "ana", name: "Ana", email: "ana@cliente.com" }]);
    expect(m.portalUser.findMany.mock.calls[0]![0].where).toEqual({ tenantId: T, id: { in: ["ana", "bia"] }, active: true });
  });

  it("empresa sem acesso: ninguém, e nem consulta as contas", async () => {
    m.company.findMany.mockResolvedValueOnce([emp("a")]);
    m.portalUserCompany.findMany.mockResolvedValueOnce([]);
    expect(await usuariosAtivosDasEmpresas(T, ["a"])).toEqual([]);
    expect(m.portalUser.findMany).not.toHaveBeenCalled();
  });

  it("sem a tabela nova o erro sobe, e ninguém é avisado por engano", async () => {
    m.company.findMany.mockResolvedValueOnce([emp("a"), emp("b")]);
    m.portalUserCompany.findMany.mockRejectedValueOnce(semTabela());
    await expect(usuariosAtivosDasEmpresas(T, ["a", "b"])).rejects.toThrow("does not exist");
    expect(m.portalUser.findMany).not.toHaveBeenCalled();
  });

  it("lista vazia de empresas: nada, sem consulta", async () => {
    expect(await usuariosAtivosDasEmpresas(T, [])).toEqual([]);
    expect(m.company.findMany).not.toHaveBeenCalled();
  });
});
