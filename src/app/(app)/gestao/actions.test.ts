import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Os itens de uma pessoa nos Coordenadores, lidos quando a linha abre
// (melhoria-662), por perfil: o coordenador de um setor só vê o setor dele,
// mesmo pedindo outro; quem não coordena nada não chega à lista.
const estado = vi.hoisted(() => ({ ctx: null as AuthContext | null }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: async () => estado.ctx,
  isFullWrite: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
  canManageSector: (ctx: AuthContext, s: string) => ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(s),
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setorDoModulo: async () => "societario" }));
vi.mock("@/lib/sectors", () => ({
  getSectorMaps: async () => ({
    labels: { dp: "Departamento Pessoal", fiscal: "Fiscal" },
    colors: {},
    options: [
      { value: "dp", label: "Departamento Pessoal" },
      { value: "fiscal", label: "Fiscal" },
    ],
  }),
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const itensDaGestao = vi.fn();
const comTitulos = vi.fn();
vi.mock("@/lib/gestao/itens", () => ({
  itensDaGestao: (...a: unknown[]) => itensDaGestao(...a),
  comTitulos: (...a: unknown[]) => comTitulos(...a),
}));

import { itensDaPessoaNaGestao } from "./actions";

function ctx(role: AuthContext["role"], sectors: string[]): AuthContext {
  return {
    userId: "eu",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

const c = (coluna: string, prazo: { situacao: string; dias: number } | null = null) => ({ coluna, parado: null, paradoDeProposito: false, prazo });
const item = (id: string, setor: string, coluna: string, prazo: { situacao: string; dias: number } | null = null) => ({
  item: { origem: "CARD", id, setor, responsaveis: ["ana"], estado: "ANDAMENTO", ultimaMovimentacao: new Date(), prazo: null, concluidoEm: null, href: `/x/${id}` },
  c: c(coluna, prazo),
});

beforeEach(() => {
  vi.clearAllMocks();
  comTitulos.mockImplementation(async (_t: string, xs: { item: { id: string } }[]) => xs.map((x) => ({ ...x, item: { ...x.item, titulo: `Título ${x.item.id}` } })));
});

describe("itens de uma pessoa nos Coordenadores, por perfil", () => {
  it("usuário comum do setor não tem a Gestão: nada é lido", async () => {
    estado.ctx = ctx("SECTOR_USER", ["dp"]);
    expect(await itensDaPessoaNaGestao("ana", null, 0)).toEqual({ error: "Sem acesso à Gestão." });
    expect(itensDaGestao).not.toHaveBeenCalled();
  });

  it("o coordenador de um setor lê só o setor dele, mesmo pedindo outro", async () => {
    estado.ctx = ctx("SECTOR_ADMIN", ["dp"]);
    itensDaGestao.mockResolvedValue([item("a", "dp", "ANDAMENTO")]);
    const r = await itensDaPessoaNaGestao("ana", "fiscal", 0);
    expect(itensDaGestao).toHaveBeenCalledWith("t1", ["dp"], expect.any(Date), { responsavel: "ana" });
    expect(r).toMatchObject({ ok: true, total: 1, itens: [{ chave: "CARD:a", titulo: "Título a", rotuloDoSetor: "Departamento Pessoal" }] });
  });

  it("a diretoria lê todos os setores, ou o do filtro", async () => {
    estado.ctx = ctx("ADMIN", []);
    itensDaGestao.mockResolvedValue([]);
    await itensDaPessoaNaGestao("ana", null, 0);
    expect(itensDaGestao).toHaveBeenLastCalledWith("t1", "todos", expect.any(Date), { responsavel: "ana" });
    await itensDaPessoaNaGestao("ana", "fiscal", 0);
    expect(itensDaGestao).toHaveBeenLastCalledWith("t1", ["fiscal"], expect.any(Date), { responsavel: "ana" });
  });

  it("só os em aberto, do que mais pede atenção, em leituras de 50", async () => {
    estado.ctx = ctx("SECTOR_ADMIN", ["dp"]);
    const muitos = Array.from({ length: 60 }, (_, i) => item(`n${i}`, "dp", "ANDAMENTO"));
    itensDaGestao.mockResolvedValue([item("feito", "dp", "CONCLUIDO"), ...muitos, item("vencido", "dp", "ANDAMENTO", { situacao: "VENCIDO", dias: 3 })]);
    const primeira = await itensDaPessoaNaGestao("ana", null, 0);
    if (!("ok" in primeira)) throw new Error("esperava a lista");
    expect(primeira.total).toBe(61);
    expect(primeira.itens).toHaveLength(50);
    expect(primeira.itens[0].chave).toBe("CARD:vencido");
    expect(primeira.itens.some((x) => x.chave === "CARD:feito")).toBe(false);
    // O título é buscado só dos 50 da leitura.
    expect(comTitulos.mock.calls[0][1]).toHaveLength(50);
    const segunda = await itensDaPessoaNaGestao("ana", null, 50);
    if (!("ok" in segunda)) throw new Error("esperava a lista");
    expect(segunda.itens).toHaveLength(11);
  });

  it("pessoa sem id não chega ao banco", async () => {
    estado.ctx = ctx("ADMIN", []);
    expect(await itensDaPessoaNaGestao("", null, 0)).toEqual({ error: "Pessoa inválida." });
    expect(itensDaGestao).not.toHaveBeenCalled();
  });
});
