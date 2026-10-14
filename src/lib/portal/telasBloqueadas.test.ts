import { beforeEach, describe, expect, it, vi } from "vitest";

// A leitura das telas bloqueadas (14/10/2026): só as do escritório pedido, só
// as que podem ser bloqueadas, e nunca derruba o portal — sem a tabela
// (deploy antes da migration) ou com erro de banco, nada fica bloqueado.

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ portalTelaBloqueada: { findMany: m.findMany } }) }));

const { lerTelasBloqueadas, telaBloqueadaNoPortal, telasBloqueadasDoPortal } = await import("./telasBloqueadas");

const semTabela = () => Object.assign(new Error("The table `portal_telas_bloqueadas` does not exist"), { code: "P2021" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("lerTelasBloqueadas", () => {
  it("lê só o escritório pedido", async () => {
    m.findMany.mockResolvedValueOnce([{ href: "/portal/dre" }, { href: "/portal/pendencias" }]);
    const r = await lerTelasBloqueadas("escritorio-a");
    expect(m.findMany).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a" }, select: { href: true } });
    expect(r.situacao).toBe("ok");
    expect([...r.bloqueadas].sort()).toEqual(["/portal/dre", "/portal/pendencias"]);
  });

  it("linha do Início, de Minha conta, da Ajuda ou de tela que saiu do catálogo não bloqueia nada", async () => {
    m.findMany.mockResolvedValueOnce([
      { href: "/portal" },
      { href: "/portal/conta" },
      { href: "/portal/ajuda" },
      { href: "/portal/tela-que-saiu" },
      { href: "/portal/dre" },
    ]);
    expect([...(await lerTelasBloqueadas("escritorio-a")).bloqueadas]).toEqual(["/portal/dre"]);
  });

  it("sem escritório, nem consulta", async () => {
    expect((await lerTelasBloqueadas("")).bloqueadas.size).toBe(0);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("sem a tabela (migration que ainda não rodou): nada bloqueado, sem lançar", async () => {
    m.findMany.mockRejectedValueOnce(semTabela());
    const r = await lerTelasBloqueadas("escritorio-a");
    expect(r).toEqual({ bloqueadas: new Set(), situacao: "sem-tabela" });
  });

  it("banco recusando a leitura: nada bloqueado, sem lançar", async () => {
    m.findMany.mockRejectedValueOnce(new Error("conexão"));
    const r = await lerTelasBloqueadas("escritorio-a");
    expect(r).toEqual({ bloqueadas: new Set(), situacao: "erro" });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("telaBloqueadaNoPortal — a pergunta de cada tela", () => {
  it("bloqueada só a que o escritório bloqueou", async () => {
    m.findMany.mockResolvedValue([{ href: "/portal/aprovacoes" }]);
    expect(await telaBloqueadaNoPortal("escritorio-a", "/portal/aprovacoes")).toBe(true);
    expect(await telaBloqueadaNoPortal("escritorio-a", "/portal/dre")).toBe(false);
    expect(m.findMany).toHaveBeenLastCalledWith({ where: { tenantId: "escritorio-a" }, select: { href: true } });
  });

  it("sem a tabela, nenhuma tela bloqueada — o portal de antes", async () => {
    m.findMany.mockRejectedValue(semTabela());
    expect(await telaBloqueadaNoPortal("escritorio-a", "/portal/aprovacoes")).toBe(false);
    expect((await telasBloqueadasDoPortal("escritorio-a")).size).toBe(0);
  });
});
