import { beforeEach, describe, expect, it, vi } from "vitest";
import { empresasDoComunicadoAntigo } from "./regras";
import { empresasPeloCliente, idsDasEmpresasDaConta, ligacoesDoPreenchimento, type EmpresaDaRegra } from "@/lib/portal/empresasDaConta";

// O que se testa: para quem o comunicado vai desde 14/10/2026 (empresas, e não
// mais Clientes) — o lado do portal, o aviso por e-mail, e o comunicado antigo,
// que a migration copia para as empresas dos clientes que o receberam.

const m = vi.hoisted(() => ({
  clientAnnouncement: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  clientAnnouncementRead: { upsert: vi.fn() },
  clientAnnouncementCompany: { findMany: vi.fn() },
  clientAnnouncementGroup: { findMany: vi.fn() },
  portalUser: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m }));
const usuarios = vi.hoisted(() => ({ usuariosAtivosDasEmpresas: vi.fn(), lerContasDasEmpresas: vi.fn() }));
vi.mock("@/lib/portal/empresasDaContaDb", () => usuarios);
vi.mock("@/lib/sectors", () => ({ getSectorMaps: async () => ({ labels: {} }) }));
vi.mock("@/lib/email/sendMail", () => ({ sendComunicadoAoClienteEmail: vi.fn() }));
vi.mock("@/lib/portal/avisos", () => ({ avisarClientePorPush: vi.fn() }));
vi.mock("@/lib/financeiro/pendencias/armazenamento", () => ({ criarArmazenamento: () => ({}) }));

const { comunicadosDoCliente, comunicadosNaoLidos, abrirComunicadoDoCliente, whereDoPublico } = await import("./consultas");
const { quemRecebeOComunicado } = await import("./avisos");

const semTabela = () => Object.assign(new Error("tabela não existe"), { code: "P2021" });
const T = "escritorio-41";

beforeEach(() => vi.clearAllMocks());

describe("o portal mostra o comunicado que foi para alguma empresa do acesso", () => {
  it("filtra pelas empresas do acesso, no escritório", async () => {
    m.clientAnnouncement.findMany.mockResolvedValueOnce([]);
    await comunicadosDoCliente(T, ["a", "b"], "pu-1");
    expect(m.clientAnnouncement.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: T,
      companies: { some: { companyId: { in: ["a", "b"] } } },
    });
  });

  it("acesso sem empresa não vê comunicado nenhum — e nem consulta", async () => {
    expect(await comunicadosDoCliente(T, [], "pu-1")).toEqual([]);
    expect(await comunicadosNaoLidos(T, [], "pu-1")).toBe(0);
    expect(await abrirComunicadoDoCliente(T, [], "pu-1", "c1")).toBeNull();
    expect(m.clientAnnouncement.findMany).not.toHaveBeenCalled();
    expect(m.clientAnnouncement.count).not.toHaveBeenCalled();
  });

  it("sem a tabela nova: o comunicado do cliente de alguma das empresas (a regra de antes)", async () => {
    m.clientAnnouncement.count.mockRejectedValueOnce(semTabela()).mockResolvedValueOnce(2);
    expect(await comunicadosNaoLidos(T, ["a"], "pu-1")).toBe(2);
    expect(m.clientAnnouncement.count.mock.calls[1]![0].where).toEqual({
      tenantId: T,
      groups: { some: { clientGroup: { companies: { some: { id: { in: ["a"] } } } } } },
      reads: { none: { portalUserId: "pu-1" } },
    });
  });
});

describe("quem recebe o e-mail do comunicado", () => {
  it("os acessos ativos que enxergam alguma das empresas do comunicado", async () => {
    m.clientAnnouncementCompany.findMany.mockResolvedValueOnce([{ companyId: "a" }, { companyId: "b" }]);
    usuarios.usuariosAtivosDasEmpresas.mockResolvedValueOnce([{ id: "ana", name: "Ana", email: "ana@x.com" }]);
    expect(await quemRecebeOComunicado(T, "c1")).toEqual([{ id: "ana", name: "Ana", email: "ana@x.com" }]);
    expect(usuarios.usuariosAtivosDasEmpresas).toHaveBeenCalledWith(T, ["a", "b"]);
  });

  it("sem a tabela nova: os acessos ativos dos clientes que recebem", async () => {
    m.clientAnnouncementCompany.findMany.mockRejectedValueOnce(semTabela());
    m.clientAnnouncementGroup.findMany.mockResolvedValueOnce([{ clientGroupId: "g1" }]);
    m.portalUser.findMany.mockResolvedValueOnce([]);
    await quemRecebeOComunicado(T, "c1");
    expect(m.portalUser.findMany.mock.calls[0]![0].where).toEqual({ tenantId: T, active: true, clientGroupId: { in: ["g1"] } });
  });
});

describe("para quem vai: os públicos", () => {
  it("todas e do setor: só empresas em operação, no escritório; escolhidas: as marcadas, no escritório", () => {
    expect(whereDoPublico(T, "TODOS", "dp", [])).toEqual({ tenantId: T, status: { notIn: ["INACTIVE", "CHURNED"] } });
    expect(whereDoPublico(T, "SETOR", "dp", [])).toEqual({
      tenantId: T,
      status: { notIn: ["INACTIVE", "CHURNED"] },
      services: { some: { sectorCode: "dp", status: "ACTIVE" } },
    });
    expect(whereDoPublico(T, "ESCOLHIDOS", "dp", ["a"])).toEqual({ tenantId: T, id: { in: ["a"] } });
  });
});

describe("o comunicado antigo (enviado a Clientes) depois da migration", () => {
  // Cliente "bld" com matriz e filial; a filial "bld-sul" não estava no cliente.
  const e = (id: string, extra: Partial<EmpresaDaRegra & { clientGroupId: string | null }> = {}) => ({
    id,
    tenantId: T,
    parentCompanyId: null as string | null,
    status: "ACTIVE" as const,
    clientGroupId: null as string | null,
    ...extra,
  });
  const EMPRESAS = [
    e("bld-matriz", { clientGroupId: "bld" }),
    e("bld-mogi", { parentCompanyId: "bld-matriz", clientGroupId: "bld" }),
    e("bld-sul", { parentCompanyId: "bld-matriz" }),
    e("irriga", { clientGroupId: "irriga" }),
    e("bld-de-outro-escritorio", { tenantId: "outro", clientGroupId: "bld" }),
  ];
  const CONTAS = [
    { id: "ana", tenantId: T, clientGroupId: "bld" },
    { id: "duda", tenantId: T, clientGroupId: "irriga" },
  ];
  const COMUNICADOS = [
    { id: "recesso", clientes: ["bld", "irriga"] },
    { id: "so-bld", clientes: ["bld"] },
    { id: "so-irriga", clientes: ["irriga"] },
  ];

  it("fica com as empresas dos clientes que o receberam, só do escritório", () => {
    expect(empresasDoComunicadoAntigo(T, ["bld"], EMPRESAS)).toEqual(["bld-matriz", "bld-mogi"]);
  });

  it("quem via o comunicado continua vendo, e quem não via não passa a ver", () => {
    for (const conta of CONTAS) {
      const alcance = new Set(idsDasEmpresasDaConta(T, ligacoesDoPreenchimento(conta, EMPRESAS), EMPRESAS));
      for (const c of COMUNICADOS) {
        const antes = c.clientes.includes(conta.clientGroupId);
        const depois = empresasDoComunicadoAntigo(T, c.clientes, EMPRESAS).some((id) => alcance.has(id));
        expect(depois, `${conta.id} × ${c.id}`).toBe(antes);
      }
      // E as empresas que via antes continuam no alcance.
      for (const id of empresasPeloCliente(conta, EMPRESAS)) expect(alcance.has(id)).toBe(true);
    }
  });
});
