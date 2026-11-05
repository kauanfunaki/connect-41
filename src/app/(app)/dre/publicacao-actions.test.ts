import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FotoDaDre } from "@/lib/dre/publicacao";
import { modeloDoCodigo } from "@/lib/dre/estrutura";

// "Publicar para o cliente": quem pode, o que recusa e o que fica na auditoria.
// A foto e o banco das publicações são simulados (`publicacaoServidor`).

const estado = vi.hoisted(() => ({
  pode: true,
  foraDoFoco: null as string | null,
  atual: null as unknown,
  publicada: null as unknown,
  publicou: [] as unknown[],
  auditoria: [] as { action: string; metadata: unknown }[],
  fotoInicial: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/dre/acesso", () => ({ podeAbrirADre: async () => estado.pode }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => estado.foraDoFoco }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (a: { action: string; metadata: unknown }) => {
    estado.auditoria.push(a);
  },
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === "emp1" ? { id: "emp1" } : null) },
    user: { findUnique: async () => ({ name: "Amanda" }) },
  }),
}));
vi.mock("@/lib/dre/publicacaoServidor", () => ({
  garantirFotoInicial: async () => {
    estado.fotoInicial++;
    return false;
  },
  fotoAtualDoMes: async () => estado.atual,
  publicacoesDaEmpresa: async () => new Map(estado.publicada ? [["2026-10", estado.publicada]] : []),
  publicarMes: async (args: unknown) => {
    estado.publicou.push(args);
  },
}));

import { publicarDreDoMes } from "./publicacao-actions";

const RECEITA = modeloDoCodigo("padrao").grupos.find((g) => g.origem === "recebimento")!.code;
const VAZIO = { porGrupo: {}, porCategoria: {}, temMovimento: false };
function foto(receita: number): FotoDaDre {
  return { versao: 1, modelo: "padrao", caixa: { porGrupo: { [RECEITA]: receita }, porCategoria: {}, temMovimento: receita !== 0 }, competencia: VAZIO };
}

beforeEach(() => {
  Object.assign(estado, { pode: true, foraDoFoco: null, atual: foto(1_000_00), publicada: null, publicou: [], auditoria: [], fotoInicial: 0 });
});

describe("publicarDreDoMes", () => {
  it("publica a foto de agora, com quem publicou, e registra na auditoria", async () => {
    expect(await publicarDreDoMes("emp1", "2026-10")).toEqual({ success: true });
    expect(estado.fotoInicial).toBe(1);
    expect(estado.publicou).toEqual([
      { tenantId: "t1", companyId: "emp1", competencia: "2026-10", foto: foto(1_000_00), userId: "u1", nome: "Amanda" },
    ]);
    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({ action: "dre.publicar", metadata: { competencia: "2026-10", substituiu: null } });
  });

  it("quem não abre a DRE não publica", async () => {
    estado.pode = false;
    expect(await publicarDreDoMes("emp1", "2026-10")).toEqual({ error: "Sem permissão no DRE." });
    expect(estado.publicou).toEqual([]);
  });

  it("empresa de outro escritório, fora do foco ou mês inválido: recusa", async () => {
    expect(await publicarDreDoMes("outra", "2026-10")).toEqual({ error: "Empresa não encontrada." });
    expect(await publicarDreDoMes("emp1", "outubro")).toEqual({ error: "Mês inválido." });
    estado.foraDoFoco = "Você está trabalhando em outra empresa.";
    expect(await publicarDreDoMes("emp1", "2026-10")).toEqual({ error: "Você está trabalhando em outra empresa." });
    expect(estado.publicou).toEqual([]);
  });

  it("igual ao portal, ou mês vazio nunca publicado: nada a publicar", async () => {
    estado.publicada = { competencia: "2026-10", foto: foto(1_000_00), inicial: true, publicadoEm: new Date(), publicadoPorNome: null };
    expect(await publicarDreDoMes("emp1", "2026-10")).toEqual({ error: "O portal já mostra esta versão." });
    estado.publicada = null;
    estado.atual = foto(0);
    expect(await publicarDreDoMes("emp1", "2026-10")).toEqual({ error: "Este mês não tem movimento para publicar." });
    expect(estado.publicou).toEqual([]);
  });

  it("republicar diz na auditoria qual versão substituiu", async () => {
    const antes = new Date("2026-11-03T12:00:00Z");
    estado.publicada = { competencia: "2026-10", foto: foto(900_00), inicial: true, publicadoEm: antes, publicadoPorNome: null };
    expect(await publicarDreDoMes("emp1", "2026-10")).toEqual({ success: true });
    expect(estado.auditoria[0]).toMatchObject({ metadata: { substituiu: { publicadoEm: antes.toISOString(), inicial: true } } });
  });
});
