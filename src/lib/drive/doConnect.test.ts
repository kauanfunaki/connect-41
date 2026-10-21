import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O "Do Connect" mostra o anexo de um módulo só para quem a rota de download
// daquele módulo deixaria baixar. Aqui o banco, os módulos e os leitores de
// disco são simulados; a régua (setor, responsável, sensível) é a real.

const estado = {
  modulos: new Set<string>(),
  sensivelLiberado: false,
  documentos: [] as unknown[],
  solicitacoes: [] as unknown[],
  pendencias: [] as unknown[],
  processos: [] as unknown[],
  documento: null as unknown,
  pendencia: null as unknown,
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    document: { findMany: async () => estado.documentos, findFirst: async () => estado.documento, groupBy: async () => [] },
    serviceRequestAttachment: { findMany: async () => estado.solicitacoes },
    clientRequestAttachment: { findMany: async () => estado.pendencias, findFirst: async () => estado.pendencia },
    processDocument: { findMany: async () => estado.processos },
    clientDocument: { findMany: async () => [], groupBy: async () => [] },
    companyMessageAttachment: { findMany: async () => [] },
  }),
}));
vi.mock("@/lib/modules", () => {
  const mod = {
  isModuleEnabled: async (_t: string, codigo: string) => estado.modulos.has(codigo),
  setorDoModulo: async (_t: string, codigo: string) =>
    ({ bpo_pendencias: "bpo", societario_processos: "societario", bpo_comunicacao: "bpo" })[codigo] ?? null,
};
  // Os setores da tela (21/10/2026): aqui, só o dono, como antes.
  const setoresDoModulo = async (t: string, c: string) => {
    const s = await (mod.setorDoModulo as (t: string, c: string) => Promise<string | null>)(t, c);
    return s == null ? null : [s];
  };
  return { ...mod, setoresDoModulo };
});
vi.mock("@/lib/auth/sensitiveFields", () => ({ canViewSensitiveField: async () => estado.sensivelLiberado }));
vi.mock("@/lib/documents", async (original) => ({
  ...(await original<typeof import("@/lib/documents")>()),
  lerArquivoDoDocumentoDaFicha: async () => Buffer.from("%PDF-1.4"),
}));
vi.mock("@/lib/solicitacoes/armazenamento", () => ({ anexosDaSolicitacao: { lerAnexo: async () => Buffer.from("x") } }));
vi.mock("@/lib/financeiro/pendencias/armazenamento", async (original) => ({
  ...(await original<typeof import("@/lib/financeiro/pendencias/armazenamento")>()),
  lerAnexo: async () => Buffer.from("%PDF-1.4"),
}));

const { anexosDoConnect, lerDoConnect, totaisDoConnect } = await import("./doConnect");

const ctx = (role: AuthContext["role"], sectors: string[] = [], userId = "eu"): AuthContext => ({
  userId,
  tenantId: "t",
  homeTenantId: "t",
  role,
  sectors,
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
});

const anexoBase = { fileName: "a.pdf", sizeBytes: 10, mimeType: "application/pdf", createdAt: new Date(), uploadedByPortalUserId: null, uploadedByUser: { name: "Ana" }, uploadedByPortal: null };

beforeEach(() => {
  estado.modulos = new Set(["portal_solicitacoes", "bpo_pendencias", "societario_processos"]);
  estado.sensivelLiberado = false;
  estado.documentos = [];
  estado.solicitacoes = [
    { ...anexoBase, id: "s-fiscal", request: { id: "r1", number: 1, sectorCode: "fiscal", assigneeId: null, subject: { label: "Notas" } } },
    { ...anexoBase, id: "s-dp-comigo", request: { id: "r2", number: 2, sectorCode: "dp", assigneeId: "eu", subject: { label: "Folha" } } },
  ];
  // p1 é de antes de 01/10 (sem setor: do setor do módulo, o BPO); p-dp, um pedido do DP.
  estado.pendencias = [
    { ...anexoBase, id: "p1", request: { id: "q1", title: "Extrato", tenantId: "t", sectorCode: null, companyId: "emp" } },
    { ...anexoBase, id: "p-dp", request: { id: "q2", title: "Ponto", tenantId: "t", sectorCode: "dp", companyId: "emp" } },
  ];
  estado.processos = [{ ...anexoBase, id: "d1", description: null, process: { id: "pr1", title: null, type: { name: "Alteração" } } }];
  estado.documento = null;
  estado.pendencia = null;
});

const ids = async (c: AuthContext) => (await anexosDoConnect(c, "emp")).flatMap((g) => g.itens.map((i) => i.id)).sort();

describe("anexosDoConnect", () => {
  it("solicitação: só do setor de quem vê, ou da qual a pessoa é responsável", async () => {
    expect(await ids(ctx("SECTOR_USER", ["fiscal"], "outro"))).toEqual(["s-fiscal"]);
    expect(await ids(ctx("SECTOR_USER", ["fiscal"], "eu"))).toEqual(["s-dp-comigo", "s-fiscal"]);
  });

  it("pendência: pelo setor de cada pedido, como a tela e a rota; processo: só para quem age no Societário", async () => {
    expect(await ids(ctx("SECTOR_USER", ["bpo"], "x"))).toEqual(["p1"]);
    expect(await ids(ctx("SECTOR_USER", ["societario"], "x"))).toEqual(["d1"]);
    // O READONLY vê tudo, mas a rota dos processos exige agir: o anexo do processo não aparece.
    expect(await ids(ctx("READONLY", [], "x"))).toEqual(["p-dp", "p1", "s-dp-comigo", "s-fiscal"]);
  });

  it("pessoa só do DP vê o anexo do pedido do DP — o que a rota agora deixa baixar", async () => {
    expect(await ids(ctx("SECTOR_USER", ["dp"], "x"))).toEqual(["p-dp", "s-dp-comigo"]);
    expect(await ids(ctx("SECTOR_USER", ["dp", "bpo"], "x"))).toEqual(["p-dp", "p1", "s-dp-comigo"]);
  });

  it("escritório só com o canal do portal: as pendências aparecem pelo setor do pedido", async () => {
    estado.modulos = new Set(["portal_solicitacoes"]);
    expect(await ids(ctx("SECTOR_USER", ["dp"], "x"))).toEqual(["p-dp", "s-dp-comigo"]);
    expect(await ids(ctx("SECTOR_USER", ["bpo"], "x"))).toEqual(["p1"]);
  });

  it("módulo desligado some com a origem inteira, até para o admin", async () => {
    estado.modulos = new Set();
    expect(await ids(ctx("ADMIN"))).toEqual([]);
  });

  it("só aparecem os grupos com algo dentro, com o rótulo da origem", async () => {
    const grupos = await anexosDoConnect(ctx("SECTOR_USER", ["bpo"], "x"), "emp");
    expect(grupos.map((g) => g.rotulo)).toEqual(["Pendências"]);
  });
});

describe("totaisDoConnect", () => {
  it("o número da empresa conta só as pendências que a pessoa abre", async () => {
    estado.modulos = new Set(["bpo_pendencias"]);
    expect((await totaisDoConnect(ctx("SECTOR_USER", ["dp"], "x"), ["emp"])).get("emp")).toBe(1);
    expect((await totaisDoConnect(ctx("SECTOR_USER", ["dp", "bpo"], "x"), ["emp"])).get("emp")).toBe(2);
    expect((await totaisDoConnect(ctx("SECTOR_USER", ["societario"], "x"), ["emp"])).get("emp")).toBeUndefined();
  });
});

describe("lerDoConnect", () => {
  it("documento da ficha comum: qualquer um copia", async () => {
    estado.documento = { fileName: "Contrato.pdf", fileUrl: "t/x.pdf", mimeType: "application/pdf", category: "CONTRATO", sensitive: false, entityId: "emp" };
    expect(await lerDoConnect(ctx("SECTOR_USER", ["fiscal"]), "documentos", "doc")).toMatchObject({ nome: "Contrato.pdf", companyId: "emp" });
  });

  it("ASO e documento marcado sensível: só com a permissão do campo sensível", async () => {
    estado.documento = { fileName: "ASO.pdf", fileUrl: "t/x.pdf", mimeType: "application/pdf", category: "ASO", sensitive: false, entityId: "emp" };
    expect(await lerDoConnect(ctx("ADMIN"), "documentos", "doc")).toBeNull();
    estado.sensivelLiberado = true;
    expect(await lerDoConnect(ctx("ADMIN"), "documentos", "doc")).not.toBeNull();
  });

  it("pendência: copia quem vê o setor do pedido; outro setor não lê", async () => {
    estado.pendencia = { fileName: "ponto.pdf", fileUrl: "t/p.pdf", mimeType: "application/pdf", request: { companyId: "emp", tenantId: "t", sectorCode: "dp" } };
    expect(await lerDoConnect(ctx("SECTOR_USER", ["dp"]), "pendencias", "p-dp")).toMatchObject({ nome: "ponto.pdf", companyId: "emp" });
    expect(await lerDoConnect(ctx("SECTOR_USER", ["bpo"]), "pendencias", "p-dp")).toBeNull();
  });

  it("origem fora do alcance não lê nada", async () => {
    estado.modulos = new Set();
    expect(await lerDoConnect(ctx("ADMIN"), "solicitacoes", "s-fiscal")).toBeNull();
  });
});
