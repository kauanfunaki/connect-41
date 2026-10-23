import { beforeEach, describe, expect, it, vi } from "vitest";

// A leitura do lembrete padrão (23/10/2026) nunca derruba o novo envio: sem
// linha, sem a tabela ou com o banco recusando, vale "sem lembrete".

const db = vi.hoisted(() => ({ tenantEnviosConfig: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));

const { lerLembretePadrao } = await import("./lembretePadrao");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lerLembretePadrao", () => {
  it("o prazo gravado do escritório", async () => {
    db.tenantEnviosConfig.findUnique.mockResolvedValue({ lembreteDias: 5 });
    expect(await lerLembretePadrao("t1")).toEqual({ dias: 5, situacao: "ok" });
    expect(db.tenantEnviosConfig.findUnique).toHaveBeenCalledWith({ where: { tenantId: "t1" }, select: { lembreteDias: true } });
  });

  it("sem linha, ou gravado sem lembrete: sem lembrete", async () => {
    db.tenantEnviosConfig.findUnique.mockResolvedValue(null);
    expect(await lerLembretePadrao("t1")).toEqual({ dias: null, situacao: "ok" });
    db.tenantEnviosConfig.findUnique.mockResolvedValue({ lembreteDias: null });
    expect(await lerLembretePadrao("t1")).toEqual({ dias: null, situacao: "ok" });
  });

  it("prazo fora dos da tela vira sem lembrete", async () => {
    db.tenantEnviosConfig.findUnique.mockResolvedValue({ lembreteDias: 7 });
    expect(await lerLembretePadrao("t1")).toEqual({ dias: null, situacao: "ok" });
  });

  it("sem a tabela, ou o banco recusando: sem lembrete, sem lançar", async () => {
    db.tenantEnviosConfig.findUnique.mockRejectedValue({ code: "P2021" });
    expect(await lerLembretePadrao("t1")).toEqual({ dias: null, situacao: "sem-tabela" });
    db.tenantEnviosConfig.findUnique.mockRejectedValue(new Error("fora do ar"));
    expect(await lerLembretePadrao("t1")).toEqual({ dias: null, situacao: "erro" });
  });
});
