import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import type { AuthContext } from "@/lib/auth/context";

// O que se testa: quem vê o tutorial sozinho, olhando o banco (administrador
// nem consulta), e o que entra nos passos de cada pessoa — a Ceci pelo setor
// ativo, os setores do seletor, os módulos do portal. Falha de banco nunca
// lança: o tutorial só não abre, ou só perde o passo.

const m = vi.hoisted(() => ({
  db: {
    tutorialVisto: { findUnique: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
  agentesDoChat: vi.fn(),
  getEnabledModuleCodes: vi.fn(),
  getSectorsWithEnabledModules: vi.fn(),
  getSectorMaps: vi.fn(),
  vapid: { chave: null as string | null },
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/ia/chat/agentes", () => ({ agentesDoChat: m.agentesDoChat }));
vi.mock("@/lib/modules", () => ({
  getEnabledModuleCodes: m.getEnabledModuleCodes,
  getSectorsWithEnabledModules: m.getSectorsWithEnabledModules,
}));
vi.mock("@/lib/sectors", () => ({ getSectorMaps: m.getSectorMaps }));
vi.mock("@/lib/vapid", () => ({ getVapidPublicKey: () => m.vapid.chave }));

const { montarTutorialDaEquipe, montarTutorialDoPortal, tutorialDaEquipeAbreSozinho, tutorialDoPortalAbreSozinho } = await import("./servidor");

function contexto(parcial: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role: "SECTOR_USER",
    sectors: ["bpo"],
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: false,
    activeSector: "bpo",
    ...parcial,
  };
}

const agente = (code: string, setor: string | null) => ({ code, especialidade: code, sugestoes: [], setor });
const SESSAO = { kind: "portal" as const, sub: "pu1", tenantId: "t1", clientGroupId: "g1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.db.tutorialVisto.findUnique.mockResolvedValue(null);
  m.db.tenant.findUnique.mockResolvedValue({ name: "41 Contábil" });
  m.agentesDoChat.mockResolvedValue([]);
  m.getEnabledModuleCodes.mockResolvedValue(new Set<string>());
  m.getSectorsWithEnabledModules.mockResolvedValue(new Set(["bpo", "dp", "fiscal"]));
  m.getSectorMaps.mockResolvedValue({ labels: {}, colors: {}, options: [{ value: "bpo" }, { value: "dp" }, { value: "fiscal" }] });
  m.vapid.chave = null;
});

describe("o tutorial da equipe abre sozinho?", () => {
  it.each(["ADMIN", "SUPER_ADMIN"] as UserRole[])("%s: não, e nem consulta o banco", async (role) => {
    expect(await tutorialDaEquipeAbreSozinho(contexto({ role }))).toBe(false);
    expect(m.db.tutorialVisto.findUnique).not.toHaveBeenCalled();
  });

  it.each(["SECTOR_USER", "SECTOR_ADMIN", "READONLY"] as UserRole[])("%s que nunca viu: sim", async (role) => {
    expect(await tutorialDaEquipeAbreSozinho(contexto({ role }))).toBe(true);
    expect(m.db.tutorialVisto.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subject_userId_tutorial: { subject: "USER", userId: "u1", tutorial: "equipe" } } })
    );
  });

  it("quem já viu a versão atual: não", async () => {
    m.db.tutorialVisto.findUnique.mockResolvedValue({ version: 1 });
    expect(await tutorialDaEquipeAbreSozinho(contexto())).toBe(false);
  });

  it("quem viu uma versão anterior: sim", async () => {
    m.db.tutorialVisto.findUnique.mockResolvedValue({ version: 0 });
    expect(await tutorialDaEquipeAbreSozinho(contexto())).toBe(true);
  });

  it("tabela que ainda não existe (deploy antes da migration): não abre, sem lançar", async () => {
    m.db.tutorialVisto.findUnique.mockRejectedValue(Object.assign(new Error("sem tabela"), { code: "P2021" }));
    expect(await tutorialDaEquipeAbreSozinho(contexto())).toBe(false);
  });

  it("sem sessão da equipe (uma requisição do portal chega sem os cabeçalhos): não abre", async () => {
    expect(await tutorialDaEquipeAbreSozinho(contexto({ userId: "", tenantId: "" }))).toBe(false);
    expect(m.db.tutorialVisto.findUnique).not.toHaveBeenCalled();
  });
});

describe("os passos da equipe", () => {
  const chaves = async (ctx: AuthContext) => (await montarTutorialDaEquipe(ctx)).passos.map((p) => p.chave);

  it("a Ceci entra quando atende o setor ativo", async () => {
    m.agentesDoChat.mockResolvedValue([agente("assistente_do_bpo", "bpo")]);
    expect(await chaves(contexto())).toContain("ceci");
  });

  it("agente de outro setor, ou só a Ajuda do Connect: sem a Ceci", async () => {
    m.agentesDoChat.mockResolvedValue([agente("assistente_do_dp", "dp"), agente("ajuda_do_connect", null)]);
    expect(await chaves(contexto())).not.toContain("ceci");
  });

  it("em Todos os setores, vale qualquer setor da pessoa que a Ceci atenda", async () => {
    m.agentesDoChat.mockResolvedValue([agente("assistente_do_dp", "dp")]);
    expect(await chaves(contexto({ sectors: ["bpo", "dp"], activeSector: null }))).toContain("ceci");
  });

  it("os agentes falharem só tira o passo da Ceci", async () => {
    m.agentesDoChat.mockRejectedValue(new Error("banco"));
    const t = await montarTutorialDaEquipe(contexto());
    expect(t.passos.map((p) => p.chave)).not.toContain("ceci");
    expect(t.passos.at(-1)!.chave).toBe("pronto");
  });

  it("os setores do seletor: só os da pessoa com módulo ligado", async () => {
    const menu = async (ctx: AuthContext) => (await montarTutorialDaEquipe(ctx)).passos.find((p) => p.chave === "menu")!.itens!.join(" ");
    expect(await menu(contexto({ sectors: ["bpo"] }))).not.toContain("Trocar de setor");
    expect(await menu(contexto({ sectors: ["bpo", "dp"], activeSector: null }))).toContain("Trocar de setor");
    // Um setor sem módulo ligado não aparece no seletor.
    expect(await menu(contexto({ sectors: ["bpo", "contabil"] }))).not.toContain("Trocar de setor");
  });

  it("o nome do escritório na boas-vindas e o papel no rodapé", async () => {
    const t = await montarTutorialDaEquipe(contexto({ role: "SECTOR_ADMIN" }));
    expect(t.passos[0]!.selo).toBe("41 Contábil");
    expect(t.rotulo).toBe("Tutorial para Gestor de setor");
    expect(m.db.tenant.findUnique).toHaveBeenCalledWith({ where: { id: "t1" }, select: { name: true } });
  });

  it("o aviso no celular segue as chaves do servidor", async () => {
    const avisos = async () => (await montarTutorialDaEquipe(contexto())).passos.find((p) => p.chave === "avisos")!.itens!.join(" ");
    expect(await avisos()).not.toContain("celular");
    m.vapid.chave = "chave-publica";
    expect(await avisos()).toContain("celular");
  });
});

describe("o tutorial do portal", () => {
  it("abre para o acesso que nunca viu, lendo pela chave do portal", async () => {
    expect(await tutorialDoPortalAbreSozinho(SESSAO)).toBe(true);
    expect(m.db.tutorialVisto.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subject_userId_tutorial: { subject: "PORTAL_USER", userId: "pu1", tutorial: "portal" } } })
    );
  });

  it("não abre para quem já viu, nem sem a tabela", async () => {
    m.db.tutorialVisto.findUnique.mockResolvedValueOnce({ version: 1 });
    expect(await tutorialDoPortalAbreSozinho(SESSAO)).toBe(false);
    m.db.tutorialVisto.findUnique.mockRejectedValueOnce(Object.assign(new Error("sem tabela"), { code: "P2021" }));
    expect(await tutorialDoPortalAbreSozinho(SESSAO)).toBe(false);
  });

  it("os passos seguem os módulos do escritório da sessão", async () => {
    m.getEnabledModuleCodes.mockResolvedValue(new Set(["portal_solicitacoes", "bpo_aprovacoes"]));
    const t = await montarTutorialDoPortal(SESSAO);
    expect(m.getEnabledModuleCodes).toHaveBeenCalledWith("t1");
    expect(t.passos.map((p) => p.chave)).toEqual(["boas-vindas", "solicitacoes", "pendencias", "documentos", "aprovacoes", "celular", "pronto"]);
    expect(t.passos[0]!.selo).toBe("41 Contábil");
  });

  it("módulos que não carregam: o tutorial sai com o básico, sem lançar", async () => {
    m.getEnabledModuleCodes.mockRejectedValue(new Error("banco"));
    m.db.tenant.findUnique.mockRejectedValue(new Error("banco"));
    const t = await montarTutorialDoPortal(SESSAO);
    expect(t.passos.map((p) => p.chave)).toEqual(["boas-vindas", "documentos", "celular", "pronto"]);
    expect(t.passos[0]!.selo).toBeUndefined();
  });
});
