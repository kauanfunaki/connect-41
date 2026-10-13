import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AuthContext } from "@/lib/auth/context";

// A rota de download da equipe, de ponta a ponta: sessão, módulos e banco
// simulados; a régua (`podeAbrirPendencia`) é a real. O banco simulado respeita
// o `where` da rota — anexo de outro escritório não é achado.

type Anexo = { id: string; tenantId: string; sectorCode: string | null };

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  ligados: new Set<string>(),
  anexos: [] as Anexo[],
  ondeConsultado: [] as unknown[],
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => estado.ctx }));
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: async (_t: string, codigo: string) => estado.ligados.has(codigo),
  setorDoModulo: async (_t: string, codigo: string) => (codigo === "bpo_pendencias" ? "bpo" : null),
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    clientRequestAttachment: {
      findFirst: async ({ where }: { where: { id: string; request: { tenantId: string } } }) => {
        estado.ondeConsultado.push(where);
        const a = estado.anexos.find((x) => x.id === where.id && x.tenantId === where.request.tenantId);
        return a
          ? { fileName: `${a.id}.pdf`, fileUrl: `${a.tenantId}/${a.id}.pdf`, mimeType: "application/pdf", request: { tenantId: a.tenantId, sectorCode: a.sectorCode } }
          : null;
      },
    },
  }),
}));
vi.mock("@/lib/financeiro/pendencias/armazenamento", async (original) => ({
  ...(await original<typeof import("@/lib/financeiro/pendencias/armazenamento")>()),
  lerAnexo: async () => Buffer.from("%PDF-1.4"),
}));

import { GET } from "./route";

function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
    ...extra,
  };
}

async function baixar(quem: AuthContext, id: string): Promise<number> {
  estado.ctx = quem;
  const r = await GET(new Request(`http://localhost/api/pendencias/anexos/${id}`) as unknown as NextRequest, { params: Promise.resolve({ id }) });
  return r.status;
}

beforeEach(() => {
  estado.ligados = new Set(["bpo_pendencias", "portal_solicitacoes"]);
  estado.ondeConsultado = [];
  estado.anexos = [
    { id: "do-dp", tenantId: "t1", sectorCode: "dp" },
    { id: "do-fiscal", tenantId: "t1", sectorCode: "fiscal" },
    { id: "do-bpo", tenantId: "t1", sectorCode: "bpo" },
    { id: "antigo", tenantId: "t1", sectorCode: null },
    { id: "de-fora", tenantId: "t2", sectorCode: "dp" },
  ];
});

describe("download de anexo de pendência pela equipe", () => {
  it("pessoa só do DP baixa o anexo do pedido do DP (era 403)", async () => {
    expect(await baixar(ctx("SECTOR_USER", ["dp"]), "do-dp")).toBe(200);
  });

  it("o arquivo sai como anexo, com o nome e o tipo gravados", async () => {
    estado.ctx = ctx("SECTOR_USER", ["dp"]);
    const r = await GET(new Request("http://localhost/x") as unknown as NextRequest, { params: Promise.resolve({ id: "do-dp" }) });
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("do-dp.pdf");
  });

  it("pessoa só do BPO baixa o do BPO e o antigo, sem setor; o do DP dá 403", async () => {
    const bpo = ctx("SECTOR_USER", ["bpo"]);
    expect(await baixar(bpo, "do-bpo")).toBe(200);
    expect(await baixar(bpo, "antigo")).toBe(200);
    expect(await baixar(bpo, "do-dp")).toBe(403);
  });

  it("pessoa do DP e do Fiscal baixa os dois; o do BPO e o antigo dão 403", async () => {
    const dpEFiscal = ctx("SECTOR_USER", ["dp", "fiscal"]);
    expect(await baixar(dpEFiscal, "do-dp")).toBe(200);
    expect(await baixar(dpEFiscal, "do-fiscal")).toBe(200);
    expect(await baixar(dpEFiscal, "do-bpo")).toBe(403);
    expect(await baixar(dpEFiscal, "antigo")).toBe(403);
  });

  it("setor que não pediu não baixa: 403, mesmo para coordenador", async () => {
    expect(await baixar(ctx("SECTOR_USER", ["societario"]), "do-dp")).toBe(403);
    expect(await baixar(ctx("SECTOR_ADMIN", ["societario"]), "do-fiscal")).toBe(403);
  });

  it("READONLY baixa de qualquer setor (só lê, como na tela)", async () => {
    expect(await baixar(ctx("READONLY", []), "do-dp")).toBe(200);
    expect(await baixar(ctx("READONLY", []), "antigo")).toBe(200);
  });

  it("com os pedidos ao cliente desligados, 403 até para o admin — e o banco nem é consultado", async () => {
    estado.ligados = new Set();
    expect(await baixar(ctx("ADMIN", []), "do-dp")).toBe(403);
    expect(await baixar(ctx("SECTOR_USER", ["dp"]), "do-dp")).toBe(403);
    expect(estado.ondeConsultado).toEqual([]);
  });

  it("escritório só com o canal do portal (sem o módulo do BPO): o DP baixa o pedido do DP", async () => {
    estado.ligados = new Set(["portal_solicitacoes"]);
    expect(await baixar(ctx("SECTOR_USER", ["dp"]), "do-dp")).toBe(200);
    expect(await baixar(ctx("SECTOR_USER", ["bpo"]), "do-dp")).toBe(403);
  });

  it("anexo de outro escritório responde 404, como id inexistente — nem o SUPER_ADMIN baixa", async () => {
    expect(await baixar(ctx("SUPER_ADMIN", []), "de-fora")).toBe(404);
    expect(await baixar(ctx("SECTOR_USER", ["dp"]), "de-fora")).toBe(404);
    expect(await baixar(ctx("SECTOR_USER", ["dp"]), "nao-existe")).toBe(404);
    expect(estado.ondeConsultado.every((w) => (w as { request: { tenantId: string } }).request.tenantId === "t1")).toBe(true);
  });

  it("sem sessão, 401", async () => {
    expect(await baixar(ctx("ADMIN", [], { userId: "" }), "do-dp")).toBe(401);
    expect(await baixar(ctx("ADMIN", [], { tenantId: "" }), "do-dp")).toBe(401);
  });
});
