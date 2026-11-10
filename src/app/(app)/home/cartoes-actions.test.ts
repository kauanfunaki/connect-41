import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AmbienteDosCartoes, Escolhas } from "@/lib/home/cartoes";

// O que se testa (10/11/2026, cartões coringa do Início): a action é a
// barreira. O padrão do setor só é gravado por quem coordena o setor ativo
// (SECTOR_ADMIN dele, admin, super admin) e vai para a auditoria; a troca da
// pessoa vale só para ela e não vai; o que a pessoa não vê não entra; e o
// "Voltar ao do setor" desfaz só a posição pedida.

const m = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  escolhas: { pessoa: null, setor: null } as { pessoa: Escolhas | null; setor: Escolhas | null },
  gravarEscolhaDaPessoa: vi.fn(async () => {}),
  gravarPadraoDoSetor: vi.fn(async () => {}),
  idDoSetor: vi.fn(async () => "setor-bpo"),
  cartoesProntos: vi.fn(async (_ctx: unknown, chaves: string[]) => chaves.map((chave) => ({ chave }))),
  logAudit: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}));

function ambiente(): AmbienteDosCartoes {
  const modulos: [string, { ligado: boolean; setores: readonly string[] }][] = [
    "bpo_contas_pagar",
    "bpo_contas_receber",
    "bpo_pendencias",
    "bpo_aprovacoes",
    "bpo_conciliacao",
  ].map((c) => [c, { ligado: true, setores: ["bpo"] }]);
  return {
    modulos: new Map([...modulos, ["dp_colaboradores", { ligado: true, setores: ["dp"] }]]),
    setores: new Set(["bpo", "dp", "fiscal"]),
    helpdesk: { ligado: false, setor: "tech" },
  };
}

vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/home/cartoesServidor", () => ({
  ambienteDosCartoes: async () => ambiente(),
  escolhasDosCartoes: async () => m.escolhas,
  cartoesProntos: m.cartoesProntos,
  gravarEscolhaDaPessoa: m.gravarEscolhaDaPessoa,
  gravarPadraoDoSetor: m.gravarPadraoDoSetor,
  idDoSetor: m.idDoSetor,
}));

const { carregarCartoes, trocarCartaoDoInicio, voltarCartaoAoDoSetor } = await import("./cartoes-actions");

const COORDENADOR_DO_BPO = { userId: "u1", tenantId: "t1", role: "SECTOR_ADMIN", sectors: ["bpo"], activeSector: "bpo", subscriptionReadOnly: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx = { ...COORDENADOR_DO_BPO };
  m.escolhas = { pessoa: null, setor: null };
});

describe("trocarCartaoDoInicio — padrão do setor", () => {
  it("quem coordena o setor ativo grava o padrão (posição trocada, o resto é o padrão de agora) e a troca vai à auditoria", async () => {
    expect(await trocarCartaoDoInicio(1, "linhas_a_conciliar", "setor")).toBeNull();
    expect(m.gravarPadraoDoSetor).toHaveBeenCalledWith(
      m.ctx,
      "bpo",
      JSON.stringify(["contas_pagar_vencidas", "linhas_a_conciliar", "pendencias_cliente", "aprovacoes_aguardando"])
    );
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sector.inicio.cartao",
        entityType: "Sector",
        entityId: "setor-bpo",
        metadata: { setor: "bpo", posicao: 2, de: "contas_pagar_semana", para: "linhas_a_conciliar" },
      })
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("o admin também grava, em qualquer setor ativo", async () => {
    m.ctx = { userId: "u2", tenantId: "t1", role: "ADMIN", sectors: [], activeSector: "dp", subscriptionReadOnly: false };
    expect(await trocarCartaoDoInicio(0, "exames_pendentes", "setor")).toBeNull();
    expect(m.gravarPadraoDoSetor).toHaveBeenCalledWith(m.ctx, "dp", expect.stringContaining("exames_pendentes"));
  });

  it("coordenador de outro setor, colaborador e quem está em \"Todos os setores\" não gravam o padrão", async () => {
    for (const ctx of [
      { ...COORDENADOR_DO_BPO, sectors: ["fiscal"] },
      { ...COORDENADOR_DO_BPO, role: "SECTOR_USER" },
      { ...COORDENADOR_DO_BPO, role: "ADMIN", activeSector: null },
    ]) {
      m.ctx = ctx;
      expect(await trocarCartaoDoInicio(0, "linhas_a_conciliar", "setor")).toEqual({ error: "Só quem coordena o setor muda o padrão dele." });
    }
    expect(m.gravarPadraoDoSetor).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("o cartão que o coordenador trocou passa a seguir o setor na tela dele também", async () => {
    m.escolhas = { pessoa: [null, "empresas_ativas", null, null], setor: null };
    await trocarCartaoDoInicio(1, "linhas_a_conciliar", "setor");
    expect(m.gravarEscolhaDaPessoa).toHaveBeenCalledWith(m.ctx, null);
  });
});

describe("trocarCartaoDoInicio — só para mim", () => {
  it("grava só a posição trocada, para a pessoa, sem auditoria", async () => {
    m.ctx = { ...COORDENADOR_DO_BPO, role: "SECTOR_USER" };
    expect(await trocarCartaoDoInicio(2, "linhas_a_conciliar", "pessoa")).toBeNull();
    expect(m.gravarEscolhaDaPessoa).toHaveBeenCalledWith(m.ctx, JSON.stringify([null, null, "linhas_a_conciliar", null]));
    expect(m.gravarPadraoDoSetor).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("indicador já em outro cartão: os dois trocam de lugar", async () => {
    // O padrão do BPO tem as aprovações na 4ª posição.
    await trocarCartaoDoInicio(0, "aprovacoes_aguardando", "pessoa");
    expect(m.gravarEscolhaDaPessoa).toHaveBeenCalledWith(
      m.ctx,
      JSON.stringify(["aprovacoes_aguardando", null, null, "contas_pagar_vencidas"])
    );
  });

  it("o que a pessoa não vê não entra, mesmo pedido direto à action", async () => {
    expect(await trocarCartaoDoInicio(0, "ferias_vencidas", "pessoa")).toEqual({ error: "Você não tem acesso a esse indicador." });
    expect(m.gravarEscolhaDaPessoa).not.toHaveBeenCalled();
  });

  it("chave desconhecida, posição fora dos quatro e destino inválido são recusados", async () => {
    expect(await trocarCartaoDoInicio(0, "cartao_que_nao_existe", "pessoa")).toHaveProperty("error");
    expect(await trocarCartaoDoInicio(4, "linhas_a_conciliar", "pessoa")).toHaveProperty("error");
    expect(await trocarCartaoDoInicio(-1, "linhas_a_conciliar", "pessoa")).toHaveProperty("error");
    expect(await trocarCartaoDoInicio(0, "linhas_a_conciliar", "todos" as "pessoa")).toHaveProperty("error");
    expect(m.gravarEscolhaDaPessoa).not.toHaveBeenCalled();
  });

  it("sem a migration, avisa o que falta em vez de quebrar", async () => {
    m.gravarEscolhaDaPessoa.mockRejectedValueOnce(Object.assign(new Error("tabela"), { code: "P2021" }));
    const r = await trocarCartaoDoInicio(0, "linhas_a_conciliar", "pessoa");
    expect(r?.error).toContain("cartoes_coringa_do_inicio");
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("sem sessão, nada", async () => {
    m.ctx = { userId: "", tenantId: "" };
    expect(await trocarCartaoDoInicio(0, "linhas_a_conciliar", "pessoa")).toEqual({ error: "Não autenticado" });
  });
});

describe("voltarCartaoAoDoSetor", () => {
  it("desfaz só a posição pedida", async () => {
    m.escolhas = { pessoa: ["empresas_ativas", null, "linhas_a_conciliar", null], setor: null };
    expect(await voltarCartaoAoDoSetor(2)).toBeNull();
    expect(m.gravarEscolhaDaPessoa).toHaveBeenCalledWith(m.ctx, JSON.stringify(["empresas_ativas", null, null, null]));
  });

  it("sem escolha nenhuma depois, apaga a linha da pessoa", async () => {
    m.escolhas = { pessoa: [null, "empresas_ativas", null, null], setor: null };
    await voltarCartaoAoDoSetor(1);
    expect(m.gravarEscolhaDaPessoa).toHaveBeenCalledWith(m.ctx, null);
  });

  it("posição sem escolha da pessoa: não grava nada", async () => {
    expect(await voltarCartaoAoDoSetor(0)).toBeNull();
    expect(m.gravarEscolhaDaPessoa).not.toHaveBeenCalled();
  });
});

describe("carregarCartoes", () => {
  it("conta só o que a pessoa vê, mesmo que peçam outra coisa", async () => {
    const r = await carregarCartoes(["linhas_a_conciliar", "ferias_vencidas"]);
    expect(r).toEqual({ cartoes: [{ chave: "linhas_a_conciliar" }] });
  });

  it("sem lista, todos os que ela vê", async () => {
    await carregarCartoes();
    const pedidas = m.cartoesProntos.mock.calls[0][1];
    expect(pedidas).toContain("contas_pagar_vencidas");
    expect(pedidas).not.toContain("ferias_vencidas");
  });
});
