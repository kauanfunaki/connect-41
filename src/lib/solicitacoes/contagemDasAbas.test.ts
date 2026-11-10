import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O balão de cada aba das Solicitações (10/11/2026, pedido do Kauan: balão
// como nos Chamados): o número é o que a lista da aba mostra ao abrir, para
// quem está olhando. Perfis simulados — a conta do Kauan é administrador e vê
// tudo, então o que importa provar é o colaborador de um setor e o do BPO.

const m = vi.hoisted(() => ({
  contarDaEquipe: vi.fn(),
  contarPendencias: vi.fn(),
  contarFilaDeAprovacoes: vi.fn(),
  empresaDaFilaDeAprovacoes: vi.fn(),
  getActiveSectors: vi.fn(),
  setorPadraoDasPendencias: vi.fn(),
}));
vi.mock("./consultas", () => ({ contarDaEquipe: m.contarDaEquipe }));
vi.mock("@/lib/financeiro/pendencias/consultas", () => ({ contarPendencias: m.contarPendencias }));
vi.mock("@/lib/financeiro/aprovacao/filaServidor", () => ({
  contarFilaDeAprovacoes: m.contarFilaDeAprovacoes,
  empresaDaFilaDeAprovacoes: m.empresaDaFilaDeAprovacoes,
}));
vi.mock("@/lib/sectors", () => ({ getActiveSectors: m.getActiveSectors }));
vi.mock("@/lib/financeiro/pendencias/setor", async (original) => ({
  ...(await original<typeof import("@/lib/financeiro/pendencias/setor")>()),
  setorPadraoDasPendencias: m.setorPadraoDasPendencias,
}));

import { contarAsAbasDoAtendimento, type AbaDoAtendimento } from "./contagemDasAbas";

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

const SEM_BPO = new Set<AbaDoAtendimento>();
const COM_BPO = new Set<AbaDoAtendimento>(["pendencias", "aprovacoes"]);

beforeEach(() => {
  vi.clearAllMocks();
  m.contarDaEquipe.mockResolvedValue(5);
  m.contarPendencias.mockResolvedValue(2);
  m.contarFilaDeAprovacoes.mockResolvedValue(3);
  m.empresaDaFilaDeAprovacoes.mockResolvedValue({ foco: null, empresaId: null });
  m.getActiveSectors.mockResolvedValue([{ code: "bpo" }, { code: "dp" }, { code: "fiscal" }]);
  m.setorPadraoDasPendencias.mockResolvedValue("bpo");
});

afterEach(() => vi.restoreAllMocks());

describe("contarAsAbasDoAtendimento", () => {
  it("colaborador do DP: cada aba conta o filtro padrão da tela, no recorte dele", async () => {
    expect(await contarAsAbasDoAtendimento(ctx("SECTOR_USER", ["dp"]), SEM_BPO)).toEqual({ solicitacoes: 5, pedidos: 2 });
    // Solicitações: "Em aberto", nos setores dele e no que está com ele.
    expect(m.contarDaEquipe).toHaveBeenCalledWith({ tenantId: "t1", setores: ["dp"], userId: "u1" }, "abertas");
    // Pedidos: "Em andamento", nos setores dele — sem as antigas sem setor, que são do BPO.
    expect(m.contarPendencias).toHaveBeenCalledWith(
      { tenantId: "t1", companyIds: null, setores: { codigos: ["dp"], incluiSemSetor: false } },
      "andamento"
    );
  });

  it("Comunicados e Envios ficam sem balão: nada neles espera a equipe e o número só cresceria", async () => {
    const contagem = await contarAsAbasDoAtendimento(ctx("ADMIN", []), COM_BPO);
    expect(contagem).not.toHaveProperty("comunicados");
    expect(contagem).not.toHaveProperty("envios");
  });

  it("as abas do BPO só contam para quem as vê", async () => {
    const contagem = await contarAsAbasDoAtendimento(ctx("SECTOR_USER", ["dp"]), SEM_BPO);
    expect(contagem).not.toHaveProperty("pendencias");
    expect(contagem).not.toHaveProperty("aprovacoes");
    expect(m.contarPendencias).toHaveBeenCalledTimes(1); // só a dos Pedidos
    expect(m.contarFilaDeAprovacoes).not.toHaveBeenCalled();
    expect(m.empresaDaFilaDeAprovacoes).not.toHaveBeenCalled();
  });

  it("do BPO: Pendências no setor do módulo e Aprovações na empresa em que a fila abre", async () => {
    m.empresaDaFilaDeAprovacoes.mockResolvedValue({ foco: { companyId: "c2" }, empresaId: "c2" });
    m.contarPendencias.mockImplementation(async (escopo: { setores: { incluiSemSetor: boolean; codigos: string[] } }) =>
      escopo.setores.codigos.length === 1 ? 6 : 2
    );
    const contagem = await contarAsAbasDoAtendimento(ctx("SECTOR_USER", ["bpo", "dp"]), COM_BPO);
    expect(contagem).toEqual({ solicitacoes: 5, pedidos: 2, pendencias: 6, aprovacoes: 3 });
    expect(m.contarPendencias).toHaveBeenCalledWith(
      { tenantId: "t1", companyIds: null, setores: { codigos: ["bpo"], incluiSemSetor: true } },
      "andamento"
    );
    // A da tela aberta sem `?empresa=`: a da faixa "Trabalhando em", ou todas.
    expect(m.empresaDaFilaDeAprovacoes).toHaveBeenCalledWith(undefined);
    expect(m.contarFilaDeAprovacoes).toHaveBeenCalledWith("t1", "c2");
  });

  it("administrador: a fila inteira, e os Pedidos de todos os setores ativos com as sem setor", async () => {
    await contarAsAbasDoAtendimento(ctx("ADMIN", []), SEM_BPO);
    expect(m.contarDaEquipe).toHaveBeenCalledWith({ tenantId: "t1", setores: null, userId: "u1" }, "abertas");
    expect(m.contarPendencias).toHaveBeenCalledWith(
      { tenantId: "t1", companyIds: null, setores: { codigos: ["bpo", "dp", "fiscal"], incluiSemSetor: true } },
      "andamento"
    );
  });

  it("zero também vai para o balão, como nos Chamados", async () => {
    m.contarDaEquipe.mockResolvedValue(0);
    expect(await contarAsAbasDoAtendimento(ctx("SECTOR_USER", ["dp"]), SEM_BPO)).toHaveProperty("solicitacoes", 0);
  });

  it("a contagem que falha deixa só a aba dela sem número", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    m.getActiveSectors.mockRejectedValue(new Error("pool timeout"));
    const contagem = await contarAsAbasDoAtendimento(ctx("SECTOR_USER", ["bpo"]), COM_BPO);
    expect(contagem).toEqual({ solicitacoes: 5, pendencias: 2, aprovacoes: 3 });
    expect(erro).toHaveBeenCalledWith("[abasDoAtendimento] contagem indisponível: pedidos", expect.any(Error));
  });

  it("sem escritório, nada conta", async () => {
    expect(await contarAsAbasDoAtendimento(ctx("SECTOR_USER", ["dp"], { tenantId: "" }), COM_BPO)).toEqual({});
    expect(m.contarDaEquipe).not.toHaveBeenCalled();
  });
});
