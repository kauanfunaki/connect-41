import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: a leitura do banco do portal por empresa (14/10/2026) — que
// toda consulta leva o escritório, que o aviso só sai para acesso ativo, e que
// sem a tabela nova (código antes da migration) a leitura cai na regra do
// Cliente em vez de derrubar o portal.

const m = vi.hoisted(() => ({
  portalUserCompany: { findMany: vi.fn() },
  company: { findMany: vi.fn() },
  portalUser: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m }));

const { lerEmpresasDaConta, lerContasDasEmpresas, usuariosAtivosDasEmpresas, idsDasEmpresasDaConta } = await import("./empresasDaContaDb");

const semTabela = () => Object.assign(new Error("The table `portal_user_companies` does not exist"), { code: "P2021" });
const T = "escritorio-41";
const emp = (id: string, extra: Record<string, unknown> = {}) => ({ id, tenantId: T, parentCompanyId: null, status: "ACTIVE", clientGroupId: null, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
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

  it("sem a tabela nova: as empresas do cliente da conta (a regra de antes), no escritório", async () => {
    m.portalUserCompany.findMany.mockRejectedValueOnce(semTabela());
    m.portalUser.findFirst.mockResolvedValueOnce({ clientGroupId: "g-bld" });
    m.company.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);

    expect(await idsDasEmpresasDaConta(T, "pu-1")).toEqual(["a", "b"]);
    expect(m.portalUser.findFirst.mock.calls[0]![0].where).toEqual({ id: "pu-1", tenantId: T });
    expect(m.company.findMany.mock.calls[0]![0].where).toEqual({ tenantId: T, clientGroupId: "g-bld" });
  });

  it("sem a tabela e sem cliente: nada — nunca tudo", async () => {
    m.portalUserCompany.findMany.mockRejectedValueOnce(semTabela());
    m.portalUser.findFirst.mockResolvedValueOnce({ clientGroupId: null });
    expect(await idsDasEmpresasDaConta(T, "pu-1")).toEqual([]);
    expect(m.company.findMany).not.toHaveBeenCalled();
  });

  it("outro erro do banco sobe — não vira lista vazia", async () => {
    m.portalUserCompany.findMany.mockRejectedValueOnce(new Error("conexão caiu"));
    await expect(lerEmpresasDaConta(T, "pu-1")).rejects.toThrow("conexão caiu");
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

  it("sem a tabela nova: quem é do cliente da empresa (a regra de antes)", async () => {
    m.company.findMany.mockResolvedValueOnce([emp("a", { clientGroupId: "g1" }), emp("b")]);
    m.portalUserCompany.findMany.mockRejectedValueOnce(semTabela());
    m.portalUser.findMany.mockResolvedValueOnce([{ id: "ana", clientGroupId: "g1" }]);
    const contas = await lerContasDasEmpresas(T, ["a", "b"]);
    expect([...contas.get("a")!.keys()]).toEqual(["ana"]);
    expect(contas.get("b")!.size).toBe(0);
    expect(m.portalUser.findMany.mock.calls[0]![0].where).toEqual({ tenantId: T, clientGroupId: { in: ["g1"] } });
  });

  it("lista vazia de empresas: nada, sem consulta", async () => {
    expect(await usuariosAtivosDasEmpresas(T, [])).toEqual([]);
    expect(m.company.findMany).not.toHaveBeenCalled();
  });
});
