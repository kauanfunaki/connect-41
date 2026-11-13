import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O funil das colunas de Contas a pagar e a receber pede os valores ao
// servidor (13/11/2026). Tudo chega do navegador: o teste confere que a ação
// passa pelo portão da tela com um perfil de um setor, respeita o foco como a
// exportação e lê os filtros pelos mesmos leitores da página.

const m = vi.hoisted(() => ({
  ctx: null as AuthContext | null,
  pode: true,
  foco: { ok: true, empresaId: "c1", empresaIds: undefined } as
    | { ok: true; empresaId: string | undefined; empresaIds: string[] | undefined }
    | { ok: false; erro: string },
  opcoes: vi.fn(),
  portao: vi.fn(),
}));

vi.mock("@/lib/auth/context", async () => {
  const papeis = await import("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: vi.fn(async () => m.ctx) };
});
vi.mock("./acessoDaTelaDeContas", () => ({
  podeUsarATelaDeContas: m.portao,
}));
vi.mock("@/lib/empresas/focoServidor", () => ({ leituraNoFoco: vi.fn(async () => m.foco) }));
vi.mock("./data", () => ({ opcoesDoFunil: m.opcoes }));

const { valoresDoFunilDasContas } = await import("./funilDasContas");

function ctx(sectors: string[]): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role: "SECTOR_USER",
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = ctx(["bpo"]);
  // O portão de verdade é testado em `acessoDaTelaDeContas.test.ts`; aqui, a regra dele: BPO entra.
  m.portao.mockImplementation(async (c: AuthContext) => c.sectors.includes("bpo"));
  m.foco = { ok: true, empresaId: "c1", empresaIds: undefined };
  m.opcoes.mockResolvedValue([{ valor: "f1", rotulo: "Alfa", n: 2 }]);
});

describe("valoresDoFunilDasContas", () => {
  it("usuário do BPO: os valores da coluna, no recorte da tela, com os funis das outras", async () => {
    const r = await valoresDoFunilDasContas(
      "PAGAR",
      "contraparte",
      "c1",
      "empresa=c1&recorte=vencidas&competencia=2026-10&categoria=c9&categoria=&pagina=3"
    );

    expect(r).toEqual([{ valor: "f1", rotulo: "Alfa", n: 2 }]);
    expect(m.portao).toHaveBeenCalledWith(m.ctx, "bpo_contas_pagar");
    const [tenantId, kind, filtro, chave] = m.opcoes.mock.calls[0];
    expect({ tenantId, kind, chave }).toEqual({ tenantId: "t1", kind: "PAGAR", chave: "contraparte" });
    expect(filtro).toEqual({
      recorte: "vencidas",
      competencia: "2026-10",
      empresaId: "c1",
      empresaIds: undefined,
      funis: { categoria: ["c9", ""] },
    });
  });

  it("usuário de outro setor: recusa, sem consultar nada", async () => {
    m.ctx = ctx(["dp"]);
    expect(await valoresDoFunilDasContas("RECEBER", "categoria", "c1", "")).toEqual({ erro: "Sem acesso a esta tela." });
    expect(m.portao).toHaveBeenCalledWith(m.ctx, "bpo_contas_receber");
    expect(m.opcoes).not.toHaveBeenCalled();
  });

  it("com foco, outra empresa é recusada; 'todas' é a base em foco", async () => {
    m.foco = { ok: false, erro: "Você está trabalhando em outra empresa." };
    expect(await valoresDoFunilDasContas("PAGAR", "categoria", "c2", "")).toEqual({ erro: "Você está trabalhando em outra empresa." });
    expect(m.opcoes).not.toHaveBeenCalled();

    m.foco = { ok: true, empresaId: undefined, empresaIds: ["c1", "c1f"] };
    await valoresDoFunilDasContas("PAGAR", "categoria", "todas", "");
    expect(m.opcoes.mock.calls[0][2]).toMatchObject({ empresaId: undefined, empresaIds: ["c1", "c1f"] });
  });

  it("recorte e competência estranhos viram os da tela: 'todas' e nenhuma", async () => {
    await valoresDoFunilDasContas("PAGAR", "situacao", "c1", "recorte=abertas&competencia=outubro");
    // "Em aberto" saiu de contas a pagar: a página manda para "todas", e o funil também.
    expect(m.opcoes.mock.calls[0][2]).toMatchObject({ recorte: "todas", competencia: undefined });
  });

  it("tipo, coluna e empresa vêm do navegador: o que não for da lista é recusado antes de tudo", async () => {
    expect(await valoresDoFunilDasContas("OUTRO", "categoria", "c1", "")).toEqual({ erro: "Tela desconhecida." });
    expect(await valoresDoFunilDasContas("PAGAR", "tenantId", "c1", "")).toEqual({ erro: "Coluna desconhecida." });
    expect(await valoresDoFunilDasContas("PAGAR", "categoria", "", "")).toEqual({ erro: "Escolha a empresa (ou todas) antes de filtrar." });
    expect(m.portao).not.toHaveBeenCalled();
    expect(m.opcoes).not.toHaveBeenCalled();
  });
});
