import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { TODAS_AS_TELAS_DO_GERAL } from "./menuGeral";

// O que se testa: a leitura do menu Geral por setor. Erro de banco — a tabela
// ainda não existir, inclusive (deploy antes da migration) — nunca lança e
// devolve o menu de hoje, com tudo; quem não é recortado por setor nem
// consulta o banco.

const db = vi.hoisted(() => ({ sectorMenuView: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));

const { lerOcultasDoGeral, telasDoGeralDaPessoa } = await import("./menuGeralDb");

const semTabela = () => Object.assign(new Error("The table `sector_menu_views` does not exist"), { code: "P2021" });
const TUDO = [...TODAS_AS_TELAS_DO_GERAL];

function pessoa(parcial: { role?: UserRole; sectors?: string[]; activeSector?: string | null } = {}) {
  return { tenantId: "t1", role: "SECTOR_USER" as UserRole, sectors: ["recrutamento"], activeSector: "recrutamento", ...parcial };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lerOcultasDoGeral", () => {
  it("lê as linhas do escritório e descarta o que não conhece", async () => {
    db.sectorMenuView.findMany.mockResolvedValue([
      { sectorCode: "recrutamento", hiddenScreens: '["transferencias","solicitacoes","lixo"]' },
      { sectorCode: "dp", hiddenScreens: "quebrado" },
    ]);
    expect(await lerOcultasDoGeral("t1")).toEqual({
      porSetor: { recrutamento: ["transferencias", "solicitacoes"], dp: [] },
      disponivel: true,
    });
    expect(db.sectorMenuView.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      select: { sectorCode: true, hiddenScreens: true },
    });
  });

  it("tabela que ainda não existe, ou qualquer erro: nada escondido e indisponível, sem lançar", async () => {
    db.sectorMenuView.findMany.mockRejectedValueOnce(semTabela());
    expect(await lerOcultasDoGeral("t1")).toEqual({ porSetor: {}, disponivel: false });
    db.sectorMenuView.findMany.mockRejectedValueOnce(new Error("conexão caiu"));
    expect(await lerOcultasDoGeral("t1")).toEqual({ porSetor: {}, disponivel: false });
  });

  it("sem escritório: não consulta", async () => {
    expect(await lerOcultasDoGeral("")).toEqual({ porSetor: {}, disponivel: false });
    expect(db.sectorMenuView.findMany).not.toHaveBeenCalled();
  });
});

describe("telasDoGeralDaPessoa", () => {
  it("o setor escolhido esconde o que configurou", async () => {
    db.sectorMenuView.findMany.mockResolvedValue([{ sectorCode: "recrutamento", hiddenScreens: '["solicitacoes","transferencias"]' }]);
    expect(await telasDoGeralDaPessoa(pessoa())).toEqual(TUDO.filter((t) => t !== "solicitacoes" && t !== "transferencias"));
  });

  it("em Todos os setores, a soma dos setores da pessoa", async () => {
    db.sectorMenuView.findMany.mockResolvedValue([{ sectorCode: "recrutamento", hiddenScreens: '["solicitacoes"]' }]);
    expect(await telasDoGeralDaPessoa(pessoa({ sectors: ["recrutamento", "dp"], activeSector: null }))).toEqual(TUDO);
  });

  it("sem linha para o setor: tudo", async () => {
    db.sectorMenuView.findMany.mockResolvedValue([]);
    expect(await telasDoGeralDaPessoa(pessoa())).toEqual(TUDO);
  });

  it("sem a tabela: tudo, como hoje", async () => {
    db.sectorMenuView.findMany.mockRejectedValue(semTabela());
    expect(await telasDoGeralDaPessoa(pessoa())).toEqual(TUDO);
  });

  it("administrador em Todos os setores, ou pessoa sem setor: tudo, sem consultar o banco", async () => {
    expect(await telasDoGeralDaPessoa(pessoa({ role: "ADMIN", sectors: ["recrutamento"], activeSector: null }))).toEqual(TUDO);
    expect(await telasDoGeralDaPessoa(pessoa({ role: "SUPER_ADMIN", sectors: [], activeSector: null }))).toEqual(TUDO);
    expect(await telasDoGeralDaPessoa(pessoa({ sectors: [], activeSector: null }))).toEqual(TUDO);
    expect(db.sectorMenuView.findMany).not.toHaveBeenCalled();
  });

  it("administrador dentro de um setor vê o que o setor vê", async () => {
    db.sectorMenuView.findMany.mockResolvedValue([{ sectorCode: "recrutamento", hiddenScreens: '["agenda"]' }]);
    expect(await telasDoGeralDaPessoa(pessoa({ role: "ADMIN", sectors: [], activeSector: "recrutamento" }))).not.toContain("agenda");
  });
});
