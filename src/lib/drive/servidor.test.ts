import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O banco simulado: as pastas do escopo e o arquivo que o findFirst acharia.
// O filtro de empresa do findFirst é do banco; aqui se testa o que vem depois
// dele — o caminho da pasta decide se o cliente (ou a pessoa da equipe) vê.
const estado: { pastas: unknown[]; arquivo: unknown; pasta: unknown } = { pastas: [], arquivo: null, pasta: null };

// Os arquivos da pasta aberta (10/11/2026): `count` diz o total da pasta e
// `findMany` devolve uma linha por arquivo da fatia pedida — o que se confere
// é o `skip`/`take`/`orderBy` que chega ao banco.
const banco = vi.hoisted(() => ({ total: 0, count: vi.fn(), findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    driveFolder: {
      findMany: async () => estado.pastas,
      findFirst: async () => estado.pasta,
      createMany: async () => ({ count: 0 }),
    },
    driveFolderSeen: { upsert: async () => ({}) },
    driveTemplateFolder: { count: async () => 1, findMany: async () => [] },
    company: { findFirst: async () => ({ id: "emp", name: "Empresa", displayName: null }) },
    driveFile: {
      findFirst: async () => estado.arquivo,
      count: banco.count,
      findMany: banco.findMany,
      groupBy: async () => [],
      aggregate: async () => ({ _count: { _all: banco.total }, _sum: { sizeBytes: 0 } }),
    },
  }),
}));

vi.mock("@/lib/sectors", () => ({ getAllSectors: async () => [] }));

const { arquivoParaOCliente, navegadorDaEquipe, navegadorDoCliente, pastaParaAEquipe } = await import("./servidor");

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

describe("arquivos da pasta aberta, por página", () => {
  const linha = (i: number) => ({
    id: `a${i}`,
    name: `arquivo-${i}.pdf`,
    sizeBytes: 1,
    mimeType: "application/pdf",
    createdAt: new Date("2026-11-10T12:00:00Z"),
    expiresAt: null,
    folderId: "fiscal",
    uploadedByPortalUserId: null,
    uploadedByUser: null,
    uploadedByPortal: null,
    _count: { accesses: 0 },
    accesses: [],
  });

  beforeEach(() => {
    banco.total = 250;
    banco.count.mockReset().mockImplementation(async () => banco.total);
    banco.findMany.mockReset().mockImplementation(async ({ skip, take }: { skip: number; take: number }) =>
      Array.from({ length: Math.max(0, Math.min(take, banco.total - skip)) }, (_, i) => linha(skip + i))
    );
  });

  it("equipe: 100 por página, por nome e id, e o total da pasta", async () => {
    const dados = await navegadorDaEquipe(ctx("ADMIN"), null, "fiscal", 3);
    expect(banco.count).toHaveBeenCalledWith({ where: { tenantId: "t", folderId: "fiscal", deletedAt: null } });
    expect(banco.findMany).toHaveBeenCalledTimes(1);
    expect(banco.findMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: "t", folderId: "fiscal", deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: 200,
      take: 100,
    });
    expect(dados?.paginacao).toEqual({ pagina: 3, total: 250, porPagina: 100 });
    expect(dados?.arquivos).toHaveLength(50);
    // As pastas não paginam: as filhas vêm em toda página.
    expect(dados?.subpastas).toEqual([]);
  });

  it("equipe: página além do fim busca de novo a última", async () => {
    const dados = await navegadorDaEquipe(ctx("ADMIN"), null, "fiscal", 9);
    expect(banco.findMany).toHaveBeenCalledTimes(2);
    expect(banco.findMany.mock.calls[1][0]).toMatchObject({ skip: 200, take: 100 });
    expect(dados?.paginacao.pagina).toBe(3);
    expect(dados?.arquivos).toHaveLength(50);
  });

  it("equipe: no primeiro nível não há arquivo para contar nem buscar", async () => {
    const dados = await navegadorDaEquipe(ctx("ADMIN"), null, null, 4);
    expect(banco.count).not.toHaveBeenCalled();
    expect(banco.findMany).not.toHaveBeenCalled();
    expect(dados?.paginacao).toEqual({ pagina: 1, total: 0, porPagina: 100 });
    expect(dados?.subpastas.map((p) => p.id)).toEqual(expect.arrayContaining(["guias", "fiscal", "dp"]));
  });

  it("portal: 50 por página, os mais novos primeiro", async () => {
    const dados = await navegadorDoCliente("t", "emp", "guias", "cliente", 2);
    expect(banco.count).toHaveBeenCalledWith({ where: { tenantId: "t", folderId: "guias", deletedAt: null } });
    expect(banco.findMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: "t", folderId: "guias", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 50,
      take: 50,
    });
    expect(dados?.paginacao).toEqual({ pagina: 2, total: 250, porPagina: 50 });
    expect(dados?.arquivos).toHaveLength(50);
    expect(dados?.subpastas.map((p) => p.id)).toEqual(["2026"]);
  });
});
