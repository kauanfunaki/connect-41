import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O banco simulado, no jeito de ./buscaServidor.test.ts: guarda cada consulta
// (para conferir o tenantId e o teto) e devolve o que o estado manda. O filtro
// de verdade é do banco; aqui se testa o que a lista pede a ele e o que faz
// com a resposta.
type Args = { where?: Record<string, unknown>; take?: number; orderBy?: unknown };
type Chamada = { tabela: string; args: Args };
const chamadas: Chamada[] = [];
const estado = {
  empresas: [] as { id: string; name: string; displayName: string | null; cnpj: string | null }[],
  total: 0,
  pastas: [] as unknown[],
  porPasta: [] as unknown[],
  envios: [] as unknown[],
  doConnect: new Map<string, number>(),
};

function registrar<T>(tabela: string, resposta: (args: Args) => T) {
  return async (args: Args) => {
    chamadas.push({ tabela, args });
    return resposta(args);
  };
}

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: {
      // Como o banco, devolve no máximo o `take` pedido.
      findMany: registrar("company", (args) => estado.empresas.slice(0, args.take ?? estado.empresas.length)),
      count: registrar("company.count", () => estado.total),
    },
    driveFolder: { findMany: registrar("driveFolder", () => estado.pastas) },
    driveFile: {
      groupBy: registrar("driveFile.groupBy", () => estado.porPasta),
      findMany: registrar("driveFile", () => estado.envios),
    },
    driveFolderSeen: { findMany: registrar("driveFolderSeen", () => []) },
  }),
}));
vi.mock("./doConnect", () => ({
  totaisDoConnect: async (_ctx: unknown, ids: string[]) => {
    chamadas.push({ tabela: "doConnect", args: { where: { ids } } });
    return estado.doConnect;
  },
}));

const { empresasDaBusca, empresasDosArquivos } = await import("./empresas");

const AGORA = new Date("2026-11-16T15:00:00Z");
const ontem = new Date(AGORA.getTime() - 86_400_000);

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

const empresa = (id: string, name: string, displayName: string | null = null) => ({ id, name, displayName, cnpj: null });

const pasta = (id: string, companyId: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  parentId: null,
  companyId,
  sectorCode: null,
  systemKey: null,
  sharedWithPortal: false,
  deletedAt: null,
  ...extra,
});

beforeEach(() => {
  chamadas.length = 0;
  estado.empresas = [];
  estado.total = 0;
  estado.pastas = [];
  estado.porPasta = [];
  estado.envios = [];
  estado.doConnect = new Map();
});

describe("empresasDaBusca — o grupo Empresas do resultado", () => {
  it("texto curto demais: nem vai ao banco", async () => {
    expect(await empresasDaBusca(ctx("ADMIN"), { termo: " a ", limite: 8 })).toEqual({ itens: [], total: 0 });
    expect(chamadas).toEqual([]);
  });

  it("pede ao banco só o limite, em ordem, e conta quantas batem ao todo", async () => {
    estado.empresas = Array.from({ length: 30 }, (_, i) => empresa(`e${i}`, `Empresa ${String(i).padStart(2, "0")}`));
    estado.total = 30;
    const r = await empresasDaBusca(ctx("ADMIN"), { termo: "empresa", limite: 8, agora: AGORA });
    expect(r.itens).toHaveLength(8);
    expect(r.total).toBe(30);
    const consulta = chamadas.find((c) => c.tabela === "company")?.args;
    expect(consulta).toMatchObject({ take: 8, orderBy: [{ name: "asc" }, { id: "asc" }] });
    // A conta dos documentos é só das empresas que voltaram.
    expect(chamadas.find((c) => c.tabela === "doConnect")?.args.where).toEqual({ ids: r.itens.map((e) => e.id) });
  });

  it("o limite nunca passa de 40, venha o que vier", async () => {
    estado.empresas = Array.from({ length: 60 }, (_, i) => empresa(`e${i}`, `Empresa ${i}`));
    estado.total = 60;
    const r = await empresasDaBusca(ctx("ADMIN"), { termo: "empresa", limite: 9999, agora: AGORA });
    expect(chamadas.find((c) => c.tabela === "company")?.args.take).toBe(40);
    expect(r.itens).toHaveLength(40);
    await empresasDaBusca(ctx("ADMIN"), { termo: "empresa", limite: 0, agora: AGORA });
    expect(chamadas.filter((c) => c.tabela === "company").at(-1)?.args.take).toBe(1);
  });

  it("toda consulta leva o tenantId, e a de empresas é a regra do termo", async () => {
    estado.empresas = [empresa("e1", "Padaria Central Ltda")];
    estado.total = 1;
    await empresasDaBusca(ctx("SECTOR_USER", ["fiscal"]), { termo: "12.345", limite: 8, agora: AGORA });
    for (const c of chamadas.filter((x) => x.tabela !== "doConnect")) expect(c.args.where?.tenantId).toBe("t");
    const where = chamadas.find((c) => c.tabela === "company")?.args.where;
    expect(where).toEqual(chamadas.find((c) => c.tabela === "company.count")?.args.where);
    expect(where?.OR).toEqual(expect.arrayContaining([{ name: { contains: "12.345" } }, { cnpj: { contains: "12345" } }]));
    // Acha também a inativa, como a busca de empresa de antes.
    expect(where).not.toHaveProperty("status");
  });

  it("conta só as pastas que quem pede vê, e põe na frente quem tem envio novo do cliente", async () => {
    estado.empresas = [empresa("e1", "Alfa Ltda"), empresa("e2", "Beta Ltda", "Beta")];
    estado.total = 2;
    estado.pastas = [
      pasta("fiscal-1", "e1"),
      pasta("dp-1", "e1", { sectorCode: "dp" }),
      pasta("enviados-2", "e2", { systemKey: "enviados" }),
    ];
    estado.porPasta = [
      { folderId: "fiscal-1", _count: { _all: 3 }, _max: { createdAt: ontem } },
      { folderId: "dp-1", _count: { _all: 5 }, _max: { createdAt: ontem } },
      { folderId: "enviados-2", _count: { _all: 1 }, _max: { createdAt: ontem } },
    ];
    estado.envios = [{ folderId: "enviados-2", createdAt: ontem }];
    estado.doConnect = new Map([["e1", 2]]);
    const r = await empresasDaBusca(ctx("SECTOR_USER", ["fiscal"]), { termo: "ltda", limite: 8, agora: AGORA });
    expect(r.itens.map((e) => [e.nome, e.documentos, e.novos])).toEqual([
      ["Beta", 1, 1],
      ["Alfa Ltda", 5, 0],
    ]);
    expect(r.itens[0].pastaDeEnviados).toBe("enviados-2");
  });

  it("nada bate: lista vazia, sem contar documento nenhum", async () => {
    const r = await empresasDaBusca(ctx("ADMIN"), { termo: "nada", limite: 8, agora: AGORA });
    expect(r).toEqual({ itens: [], total: 0 });
    expect(chamadas.map((c) => c.tabela).sort()).toEqual(["company", "company.count"]);
  });
});

describe("empresasDosArquivos — a lista do início", () => {
  it("só as ativas do escritório, 12 por página", async () => {
    estado.empresas = Array.from({ length: 30 }, (_, i) => empresa(`e${i}`, `Empresa ${String(i).padStart(2, "0")}`));
    const r = await empresasDosArquivos(ctx("ADMIN"), { pagina: 2, agora: AGORA });
    expect(chamadas.find((c) => c.tabela === "company")?.args.where).toEqual({ tenantId: "t", status: "ACTIVE" });
    expect(r).toMatchObject({ pagina: 2, paginas: 3, total: 30, comNovidade: 0 });
    expect(r.itens.map((e) => e.nome)).toEqual(Array.from({ length: 12 }, (_, i) => `Empresa ${i + 12}`));
  });
});
