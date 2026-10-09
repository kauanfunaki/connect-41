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
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    document: { findMany: async () => estado.documentos, findFirst: async () => estado.documento },
    serviceRequestAttachment: { findMany: async () => estado.solicitacoes },
    clientRequestAttachment: { findMany: async () => estado.pendencias },
    processDocument: { findMany: async () => estado.processos },
    clientDocument: { findMany: async () => [] },
    companyMessageAttachment: { findMany: async () => [] },
  }),
}));
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: async (_t: string, codigo: string) => estado.modulos.has(codigo),
  setorDoModulo: async (_t: string, codigo: string) =>
    ({ bpo_pendencias: "bpo", societario_processos: "societario", bpo_comunicacao: "bpo" })[codigo] ?? null,
}));
vi.mock("@/lib/auth/sensitiveFields", () => ({ canViewSensitiveField: async () => estado.sensivelLiberado }));
vi.mock("@/lib/documents", async (original) => ({
  ...(await original<typeof import("@/lib/documents")>()),
  lerArquivoDoDocumentoDaFicha: async () => Buffer.from("%PDF-1.4"),
}));
vi.mock("@/lib/solicitacoes/armazenamento", () => ({ anexosDaSolicitacao: { lerAnexo: async () => Buffer.from("x") } }));

const { anexosDoConnect, lerDoConnect } = await import("./doConnect");

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
  estado.pendencias = [{ ...anexoBase, id: "p1", request: { id: "q1", title: "Extrato" } }];
  estado.processos = [{ ...anexoBase, id: "d1", description: null, process: { id: "pr1", title: null, type: { name: "Alteração" } } }];
  estado.documento = null;
});

const ids = async (c: AuthContext) => (await anexosDoConnect(c, "emp")).flatMap((g) => g.itens.map((i) => i.id)).sort();

describe("anexosDoConnect", () => {
  it("solicitação: só do setor de quem vê, ou da qual a pessoa é responsável", async () => {
    expect(await ids(ctx("SECTOR_USER", ["fiscal"], "outro"))).toEqual(["s-fiscal"]);
    expect(await ids(ctx("SECTOR_USER", ["fiscal"], "eu"))).toEqual(["s-dp-comigo", "s-fiscal"]);
  });

  it("pendência: só para quem vê o setor do módulo; processo: só para quem age no Societário", async () => {
    expect(await ids(ctx("SECTOR_USER", ["bpo"], "x"))).toEqual(["p1"]);
    expect(await ids(ctx("SECTOR_USER", ["societario"], "x"))).toEqual(["d1"]);
    // O READONLY vê tudo, mas a rota dos processos exige agir: o anexo do processo não aparece.
    expect(await ids(ctx("READONLY", [], "x"))).toEqual(["p1", "s-dp-comigo", "s-fiscal"]);
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

  it("origem fora do alcance não lê nada", async () => {
    estado.modulos = new Set();
    expect(await lerDoConnect(ctx("ADMIN"), "solicitacoes", "s-fiscal")).toBeNull();
  });
});
