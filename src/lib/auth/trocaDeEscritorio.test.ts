import { beforeEach, describe, expect, it, vi } from "vitest";
import { escritoriosAcessiveis, escritoriosDaTroca, identidadeNoEscritorio } from "./trocaDeEscritorio";

// A troca de escritório para quem não é administrador (revisão de 05/10),
// com contextos simulados. O caminho completo, do token ao cabeçalho que as
// telas leem, está em src/proxy.test.ts.

const userTenantAccess = { findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ userTenantAccess }) }));
const { getAccessibleTenantIds } = await import("./tenantAccess");

beforeEach(() => vi.clearAllMocks());

const PAPEIS_COMUNS = ["ADMIN", "SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as const;

describe("usuário comum com um escritório", () => {
  it("não ganha lista de escritórios no token", async () => {
    for (const papel of PAPEIS_COMUNS) {
      expect(escritoriosAcessiveis(papel, "escritorio-a", [])).toEqual([]);
      expect(await getAccessibleTenantIds("u1", papel, "escritorio-a")).toEqual([]);
    }
  });

  it("não vê a troca: a janela lista só o escritório atual", () => {
    expect(escritoriosDaTroca([], "escritorio-a")).toEqual(["escritorio-a"]);
  });

  it("não troca por chamada direta: o cookie de outro escritório é ignorado", () => {
    const token = { tenantId: "escritorio-a", sectors: ["fiscal"], accessibleTenants: [] };
    expect(identidadeNoEscritorio(token, "escritorio-b")).toEqual({ tenantId: "escritorio-a", sectors: ["fiscal"] });
    // Token antigo, sem o campo.
    expect(identidadeNoEscritorio({ tenantId: "escritorio-a", sectors: ["fiscal"] }, "escritorio-b")).toEqual({
      tenantId: "escritorio-a",
      sectors: ["fiscal"],
    });
  });
});

describe("usuário comum com concessão gravada para outro escritório", () => {
  // A concessão (UserTenantAccess) só vale para SUPER_ADMIN — está no schema
  // e na tela de workspaces, que só lista Super Admins. Gravada para um papel
  // comum (pela ação, direto), ela é inerte: nem é lida.
  it("a concessão não entra no token, e o banco nem é consultado", async () => {
    userTenantAccess.findMany.mockResolvedValue([{ tenantId: "escritorio-b" }]);
    for (const papel of PAPEIS_COMUNS) {
      expect(await getAccessibleTenantIds("u1", papel, "escritorio-a")).toEqual([]);
      expect(escritoriosAcessiveis(papel, "escritorio-a", ["escritorio-b"])).toEqual([]);
    }
    expect(userTenantAccess.findMany).not.toHaveBeenCalled();
  });

  it("não vê a troca nem troca pelo cookie", () => {
    const acessiveis = escritoriosAcessiveis("ADMIN", "escritorio-a", ["escritorio-b"]);
    expect(escritoriosDaTroca(acessiveis, "escritorio-a")).toHaveLength(1);
    const token = { tenantId: "escritorio-a", sectors: ["fiscal"], accessibleTenants: acessiveis };
    expect(identidadeNoEscritorio(token, "escritorio-b").tenantId).toBe("escritorio-a");
  });
});

describe("SUPER_ADMIN, como antes", () => {
  it("o token leva o escritório de origem e os concedidos, sem repetir", async () => {
    userTenantAccess.findMany.mockResolvedValue([{ tenantId: "escritorio-b" }, { tenantId: "escritorio-a" }]);
    expect(await getAccessibleTenantIds("u1", "SUPER_ADMIN", "escritorio-a")).toEqual(["escritorio-a", "escritorio-b"]);
    expect(userTenantAccess.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, select: { tenantId: true } });
  });

  it("vê a troca com os escritórios dele", () => {
    const acessiveis = escritoriosAcessiveis("SUPER_ADMIN", "escritorio-a", ["escritorio-b"]);
    expect(escritoriosDaTroca(acessiveis, "escritorio-a")).toEqual(["escritorio-a", "escritorio-b"]);
  });

  it("troca para um concedido, sem os setores do escritório de origem", () => {
    const token = { tenantId: "escritorio-a", sectors: ["fiscal"], accessibleTenants: ["escritorio-a", "escritorio-b"] };
    expect(identidadeNoEscritorio(token, "escritorio-b")).toEqual({ tenantId: "escritorio-b", sectors: [] });
  });

  it("não troca para um escritório fora da lista, e volta com os setores no de origem", () => {
    const token = { tenantId: "escritorio-a", sectors: ["fiscal"], accessibleTenants: ["escritorio-a", "escritorio-b"] };
    expect(identidadeNoEscritorio(token, "escritorio-c")).toEqual({ tenantId: "escritorio-a", sectors: ["fiscal"] });
    expect(identidadeNoEscritorio(token, "escritorio-a")).toEqual({ tenantId: "escritorio-a", sectors: ["fiscal"] });
    expect(identidadeNoEscritorio(token, undefined)).toEqual({ tenantId: "escritorio-a", sectors: ["fiscal"] });
  });
});
