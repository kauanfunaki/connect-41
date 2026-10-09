import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O banco simulado: as pastas do escopo e o arquivo que o findFirst acharia.
// O filtro de empresa do findFirst é do banco; aqui se testa o que vem depois
// dele — o caminho da pasta decide se o cliente (ou a pessoa da equipe) vê.
const estado: { pastas: unknown[]; arquivo: unknown; pasta: unknown } = { pastas: [], arquivo: null, pasta: null };

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    driveFolder: {
      findMany: async () => estado.pastas,
      findFirst: async () => estado.pasta,
    },
    driveFile: { findFirst: async () => estado.arquivo },
  }),
}));

const { arquivoParaOCliente, pastaParaAEquipe } = await import("./servidor");

const pasta = (id: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  parentId,
  companyId: "emp",
  sectorCode: null,
  systemKey: null,
  sharedWithPortal: false,
  deletedAt: null,
  ...extra,
});

const arquivoEm = (folderId: string) => ({
  id: "arq",
  name: "guia.pdf",
  mimeType: "application/pdf",
  storageKey: "t/x.pdf",
  folderId,
  folder: { companyId: "emp" },
});

const ctx = (role: AuthContext["role"], sectors: string[] = []): AuthContext => ({
  userId: "u",
  tenantId: "t",
  homeTenantId: "t",
  role,
  sectors,
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
});

beforeEach(() => {
  estado.pastas = [
    pasta("guias", null, { sharedWithPortal: true }),
    pasta("2026", "guias"),
    pasta("fiscal", null),
    pasta("velha", null, { sharedWithPortal: true, deletedAt: new Date() }),
    pasta("dentro-da-velha", "velha"),
    pasta("dp", null, { sectorCode: "dp" }),
    pasta("holerites", "dp"),
  ];
  estado.arquivo = null;
  estado.pasta = null;
});

describe("arquivoParaOCliente", () => {
  it("entrega o arquivo de pasta compartilhada, inclusive em subpasta dela", async () => {
    estado.arquivo = arquivoEm("2026");
    expect(await arquivoParaOCliente("t", ["emp"], "arq")).toMatchObject({ id: "arq" });
  });

  it("não entrega arquivo de pasta que não foi compartilhada", async () => {
    estado.arquivo = arquivoEm("fiscal");
    expect(await arquivoParaOCliente("t", ["emp"], "arq")).toBeNull();
  });

  it("não entrega nada de pasta na lixeira, nem de dentro dela", async () => {
    estado.arquivo = arquivoEm("dentro-da-velha");
    expect(await arquivoParaOCliente("t", ["emp"], "arq")).toBeNull();
  });

  it("arquivo que o banco não achou (outra empresa, lixeira) é null", async () => {
    estado.arquivo = null;
    expect(await arquivoParaOCliente("t", ["emp"], "arq")).toBeNull();
  });

  it("arquivo de pasta interna (sem empresa) nunca vai para o cliente", async () => {
    estado.arquivo = { ...arquivoEm("guias"), folder: { companyId: null } };
    expect(await arquivoParaOCliente("t", ["emp"], "arq")).toBeNull();
  });
});

describe("pastaParaAEquipe", () => {
  it("pasta do DP: só para o DP e para quem vê tudo", async () => {
    estado.pasta = pasta("holerites", "dp");
    expect(await pastaParaAEquipe(ctx("SECTOR_USER", ["fiscal"]), "holerites")).toBeNull();
    expect(await pastaParaAEquipe(ctx("SECTOR_USER", ["dp"]), "holerites")).not.toBeNull();
    expect(await pastaParaAEquipe(ctx("READONLY"), "holerites")).not.toBeNull();
  });

  it("pasta na lixeira (ou dentro de uma) some para a equipe também", async () => {
    estado.pasta = pasta("dentro-da-velha", "velha");
    expect(await pastaParaAEquipe(ctx("ADMIN"), "dentro-da-velha")).toBeNull();
  });

  it("devolve o caminho completo, que é o que as ações conferem", async () => {
    estado.pasta = pasta("2026", "guias");
    const alvo = await pastaParaAEquipe(ctx("SECTOR_USER", ["bpo"]), "2026");
    expect(alvo?.caminho.map((p) => p.id)).toEqual(["guias", "2026"]);
  });
});
