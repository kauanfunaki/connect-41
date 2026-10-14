import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: a marca de "já vi o tutorial" — a chave é sempre de quem e de
// qual tutorial; erro de banco (a tabela ainda não existir, inclusive) nunca
// lança: na leitura vira "indisponível", na gravação `false`.

const db = vi.hoisted(() => ({
  tutorialVisto: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));

const { apagarTutoriaisDoPortal, lerTutorialVisto, marcarTutorialVisto } = await import("./vistos");

const semTabela = () => Object.assign(new Error("The table `tutoriais_vistos` does not exist"), { code: "P2021" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lerTutorialVisto", () => {
  it("lê pela chave de quem e de qual tutorial", async () => {
    db.tutorialVisto.findUnique.mockResolvedValue({ version: 1 });
    expect(await lerTutorialVisto({ subject: "USER", userId: "u1" }, "equipe")).toEqual({ tipo: "visto", versao: 1 });
    expect(db.tutorialVisto.findUnique).toHaveBeenCalledWith({
      where: { subject_userId_tutorial: { subject: "USER", userId: "u1", tutorial: "equipe" } },
      select: { version: true },
    });
  });

  it("sem linha: nunca viu", async () => {
    db.tutorialVisto.findUnique.mockResolvedValue(null);
    expect(await lerTutorialVisto({ subject: "PORTAL_USER", userId: "pu1" }, "portal")).toEqual({ tipo: "nunca" });
  });

  it("tabela que ainda não existe, ou qualquer erro do banco: indisponível, sem lançar", async () => {
    db.tutorialVisto.findUnique.mockRejectedValueOnce(semTabela());
    expect(await lerTutorialVisto({ subject: "USER", userId: "u1" }, "equipe")).toEqual({ tipo: "indisponivel" });
    db.tutorialVisto.findUnique.mockRejectedValueOnce(new Error("conexão caiu"));
    expect(await lerTutorialVisto({ subject: "USER", userId: "u1" }, "equipe")).toEqual({ tipo: "indisponivel" });
  });

  it("sem id: indisponível, sem consultar", async () => {
    expect(await lerTutorialVisto({ subject: "USER", userId: "" }, "equipe")).toEqual({ tipo: "indisponivel" });
    expect(db.tutorialVisto.findUnique).not.toHaveBeenCalled();
  });
});

describe("marcarTutorialVisto", () => {
  it("grava por cima, com a versão e o escritório", async () => {
    db.tutorialVisto.upsert.mockResolvedValue({});
    expect(await marcarTutorialVisto({ subject: "PORTAL_USER", userId: "pu1", tenantId: "t1" }, "portal", 3)).toBe(true);
    const args = db.tutorialVisto.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ subject_userId_tutorial: { subject: "PORTAL_USER", userId: "pu1", tutorial: "portal" } });
    expect(args.create).toMatchObject({ subject: "PORTAL_USER", userId: "pu1", tutorial: "portal", tenantId: "t1", version: 3 });
    expect(args.update).toMatchObject({ version: 3 });
    // O dono e o escritório não mudam numa gravação por cima.
    expect(args.update).not.toHaveProperty("tenantId");
    expect(args.update).not.toHaveProperty("userId");
  });

  it("tabela que ainda não existe: false, sem lançar", async () => {
    db.tutorialVisto.upsert.mockRejectedValueOnce(semTabela());
    expect(await marcarTutorialVisto({ subject: "USER", userId: "u1", tenantId: "t1" }, "equipe", 1)).toBe(false);
  });

  it("sem id ou sem escritório: não grava", async () => {
    expect(await marcarTutorialVisto({ subject: "USER", userId: "", tenantId: "t1" }, "equipe", 1)).toBe(false);
    expect(await marcarTutorialVisto({ subject: "USER", userId: "u1", tenantId: "" }, "equipe", 1)).toBe(false);
    expect(db.tutorialVisto.upsert).not.toHaveBeenCalled();
  });
});

describe("apagarTutoriaisDoPortal", () => {
  it("apaga só as marcas do portal, do escritório e dos acessos pedidos", async () => {
    db.tutorialVisto.deleteMany.mockResolvedValue({ count: 2 });
    await apagarTutoriaisDoPortal("t1", ["pu1", "pu2"]);
    expect(db.tutorialVisto.deleteMany).toHaveBeenCalledWith({
      where: { subject: "PORTAL_USER", tenantId: "t1", userId: { in: ["pu1", "pu2"] } },
    });
  });

  it("sem acesso, não consulta; erro do banco não lança", async () => {
    await apagarTutoriaisDoPortal("t1", []);
    expect(db.tutorialVisto.deleteMany).not.toHaveBeenCalled();
    db.tutorialVisto.deleteMany.mockRejectedValueOnce(semTabela());
    await expect(apagarTutoriaisDoPortal("t1", ["pu1"])).resolves.toBeUndefined();
  });
});
