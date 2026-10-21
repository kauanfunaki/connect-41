import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: para quem o comunicado vai desde 14/10/2026 (empresas, e não
// mais Clientes) — o lado do portal e o aviso por e-mail. A volta para os
// Clientes, sem a tabela nova, saiu em 21/10/2026 (etapa 3).

const m = vi.hoisted(() => ({
  clientAnnouncement: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  clientAnnouncementRead: { upsert: vi.fn() },
  clientAnnouncementCompany: { findMany: vi.fn() },
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

  it("sem a tabela nova o erro sobe: não há mais a regra do Cliente por trás", async () => {
    m.clientAnnouncement.count.mockRejectedValueOnce(semTabela());
    await expect(comunicadosNaoLidos(T, ["a"], "pu-1")).rejects.toThrow("tabela não existe");
    expect(m.clientAnnouncement.count).toHaveBeenCalledTimes(1);
  });
});

describe("quem recebe o e-mail do comunicado", () => {
  it("os acessos ativos que enxergam alguma das empresas do comunicado", async () => {
    m.clientAnnouncementCompany.findMany.mockResolvedValueOnce([{ companyId: "a" }, { companyId: "b" }]);
    usuarios.usuariosAtivosDasEmpresas.mockResolvedValueOnce([{ id: "ana", name: "Ana", email: "ana@x.com" }]);
    expect(await quemRecebeOComunicado(T, "c1")).toEqual([{ id: "ana", name: "Ana", email: "ana@x.com" }]);
    expect(usuarios.usuariosAtivosDasEmpresas).toHaveBeenCalledWith(T, ["a", "b"]);
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
