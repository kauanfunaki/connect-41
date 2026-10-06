import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { DEFAULT_HOME_WIDGETS, parseHomeWidgets, serializeHomeWidgets, visibleWidgets, type HomeWidgetKey } from "@/lib/homeWidgets";

// Os módulos do tenant, simulados como em acessoDosPaineis.test: todos os dos
// painéis ativos, cada um no setor do catálogo.
const estados = vi.hoisted(() => ({
  lista: [] as { code: string; enabled: boolean; sectorCode: string }[],
}));
vi.mock("@/lib/modules", () => ({ getTenantModuleStates: async () => estados.lista }));

import { acessoDosPaineis, type AcessoDoPainel } from "./acessoDosPaineis";
import { escolherDestaques, type NumerosDaHome } from "./destaques";
import type { FaixaDeVencimento, Soma } from "./paineis";

const PADRAO = [
  { code: "bpo_contas_pagar", enabled: true, sectorCode: "bpo" },
  { code: "bpo_contas_receber", enabled: true, sectorCode: "bpo" },
  { code: "bpo_pendencias", enabled: true, sectorCode: "bpo" },
  { code: "bpo_aprovacoes", enabled: true, sectorCode: "bpo" },
  { code: "societario_processos", enabled: true, sectorCode: "societario" },
  { code: "dp_colaboradores", enabled: true, sectorCode: "dp" },
  { code: "recrutamento_vagas", enabled: true, sectorCode: "recrutamento" },
  { code: "tech_certificados", enabled: true, sectorCode: "tech" },
];

beforeEach(() => {
  estados.lista = PADRAO.map((e) => ({ ...e }));
});

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

const zero: Soma = { n: 0, centavos: 0 };

function carteira(f: Partial<Record<FaixaDeVencimento, Soma>> = {}): Record<FaixaDeVencimento, Soma> {
  return { vencida: zero, hoje: zero, semana: zero, depois: zero, ...f };
}

/** Um escritório com alerta em todo painel — quem decide o que aparece é o acesso. */
const TUDO_EM_ALERTA: Required<NumerosDaHome> = {
  tarefas: { atrasadas: 4, hoje: 2, abertas: 30 },
  contas: {
    verPagar: true,
    verReceber: true,
    pagar: carteira({ vencida: { n: 3, centavos: 150_000 }, semana: { n: 27, centavos: 900_000 } }),
    receber: carteira({ vencida: { n: 1, centavos: 50_000 } }),
  },
  semanas: { estaSemana: { n: 5, centavos: 120_000 } },
  pendencias: {
    pendencias: { vencidas: 2, respondidas: 1, aguardando: 6 },
    aprovacoes: { aguardando: { n: 3, centavos: 80_000 }, reprovadas: zero },
  },
  processos: { abertos: 40, estourados: 5, noLimite: 3 },
  dp: { feriasVencidas: 1, feriasAVencer: 4 },
  recrutamento: { vagas: 6, candidaturas: 48 },
  certificados: { vencidos: 2, aRenovar: 7 },
};

/**
 * O que a Home faz: os painéis com acesso, filtrados pelo "Personalizar", e
 * os números só desses (o `numerosDaHome` nem consulta os outros).
 */
async function faixaDe(c: AuthContext, preferencia: string | null = null): Promise<string[]> {
  const acesso = await acessoDosPaineis(c);
  const naHome = visibleWidgets("paineis", parseHomeWidgets(preferencia), {
    showRestricted: false,
    paineisDoSetor: new Set(acesso.keys()),
  });
  const visiveis = new Set<HomeWidgetKey>(naHome);
  const de = (k: HomeWidgetKey): AcessoDoPainel | undefined => (visiveis.has(k) ? acesso.get(k) : undefined);
  const contas = de("painel-contas");
  const numeros: NumerosDaHome = {
    tarefas: visiveis.has("painel-tarefas") ? TUDO_EM_ALERTA.tarefas : undefined,
    contas: contas
      ? {
          ...TUDO_EM_ALERTA.contas,
          verPagar: contas.modulos.has("bpo_contas_pagar"),
          verReceber: contas.modulos.has("bpo_contas_receber"),
        }
      : undefined,
    semanas: de("painel-semanas") ? TUDO_EM_ALERTA.semanas : undefined,
    pendencias: de("painel-pendencias") ? TUDO_EM_ALERTA.pendencias : undefined,
    processos: de("painel-processos") ? TUDO_EM_ALERTA.processos : undefined,
    dp: de("painel-dp") ? TUDO_EM_ALERTA.dp : undefined,
    recrutamento: de("painel-recrutamento") ? TUDO_EM_ALERTA.recrutamento : undefined,
    certificados: de("painel-certificados") ? TUDO_EM_ALERTA.certificados : undefined,
  };
  return escolherDestaques(numeros, visiveis).map((d) => d.metrica);
}

const TODOS = new Set<HomeWidgetKey>(DEFAULT_HOME_WIDGETS);

describe("escolherDestaques — a ordem", () => {
  it("alertas primeiro: dinheiro vencido, tarefas atrasadas, prazo estourado", () => {
    const d = escolherDestaques(TUDO_EM_ALERTA, TODOS);
    expect(d.map((x) => x.metrica)).toEqual(["pagar_vencido", "tarefas_atrasadas", "processos_estourados"]);
    expect(d.every((x) => x.alerta)).toBe(true);
  });

  it("sem alerta, o volume em aberto — e um cartão por painel", () => {
    const calmo: NumerosDaHome = {
      tarefas: { atrasadas: 0, hoje: 3, abertas: 12 },
      contas: { ...TUDO_EM_ALERTA.contas, pagar: carteira({ semana: { n: 30, centavos: 1_234_500 } }), receber: carteira() },
      semanas: TUDO_EM_ALERTA.semanas,
      processos: { abertos: 9, estourados: 0, noLimite: 0 },
    };
    const d = escolherDestaques(calmo, TODOS);
    expect(d.map((x) => x.metrica)).toEqual(["pagar_aberto", "tarefas_hoje", "processos_abertos"]);
    expect(d[0]).toMatchObject({ titulo: "Em aberto", valor: 1_234_500, apoio: "30 contas a pagar", href: "/pagar", alerta: false });
    expect(d[2].apoio).toBe("nenhum com prazo estourado");
  });

  it("um alerta passa à frente do volume de um painel mais importante", () => {
    const d = escolherDestaques(
      {
        contas: { ...TUDO_EM_ALERTA.contas, pagar: carteira({ hoje: { n: 2, centavos: 1000 } }), receber: carteira() },
        certificados: { vencidos: 1, aRenovar: 0 },
      },
      TODOS
    );
    expect(d.map((x) => x.metrica)).toEqual(["certificados_vencidos", "pagar_aberto"]);
  });

  it("com menos de três candidatos, mostra os que houver; sem nenhum, nada", () => {
    expect(escolherDestaques({ recrutamento: { vagas: 2, candidaturas: 1 } }, TODOS).map((x) => x.apoio)).toEqual(["1 candidatura"]);
    expect(escolherDestaques({}, TODOS)).toEqual([]);
    // Volume zerado não vira cartão.
    expect(
      escolherDestaques(
        {
          tarefas: { atrasadas: 0, hoje: 0, abertas: 5 },
          recrutamento: { vagas: 0, candidaturas: 0 },
          processos: { abertos: 0, estourados: 0, noLimite: 0 },
          dp: { feriasVencidas: 0, feriasAVencer: 0 },
          certificados: { vencidos: 0, aRenovar: 0 },
          semanas: { estaSemana: zero },
          contas: { ...TUDO_EM_ALERTA.contas, pagar: carteira(), receber: carteira() },
        },
        TODOS
      )
    ).toEqual([]);
  });

  it("respeita o máximo pedido", () => {
    expect(escolherDestaques(TUDO_EM_ALERTA, TODOS, 1)).toHaveLength(1);
    expect(escolherDestaques(TUDO_EM_ALERTA, TODOS, 0)).toEqual([]);
  });
});

describe("escolherDestaques — o que cada painel oferece", () => {
  it("contas: o vencido a pagar; sem ele, o a receber; quem só vê o receber nunca vê o pagar", () => {
    const soReceber = { ...TUDO_EM_ALERTA.contas, verPagar: false };
    expect(escolherDestaques({ contas: soReceber }, TODOS)[0]).toMatchObject({
      metrica: "receber_vencido",
      titulo: "A receber vencido",
      valor: 50_000,
      apoio: "1 conta vencida",
      href: "/receber?recorte=vencidas",
    });
    const pagarEmDia = { ...TUDO_EM_ALERTA.contas, pagar: carteira({ hoje: { n: 1, centavos: 10 } }) };
    expect(escolherDestaques({ contas: pagarEmDia }, TODOS)[0].metrica).toBe("receber_vencido");
  });

  it("pendências: sem acesso às pendências, o que espera aprovação", () => {
    const d = escolherDestaques({ pendencias: { pendencias: null, aprovacoes: TUDO_EM_ALERTA.pendencias.aprovacoes } }, TODOS);
    expect(d[0]).toMatchObject({ metrica: "aprovacoes_aguardando", valor: 3, href: "/aprovacoes?situacao=aguardando" });
    expect(d[0].apoio).toMatch(/^R\$\s800,00 a pagar$/);
  });

  it("número de painel fora da Home é ignorado, mesmo que tenha vindo", () => {
    const soTarefas = new Set<HomeWidgetKey>(["painel-tarefas"]);
    expect(escolherDestaques(TUDO_EM_ALERTA, soTarefas).map((x) => x.metrica)).toEqual(["tarefas_atrasadas"]);
  });
});

describe("a faixa por perfil (acesso simulado + Personalizar)", () => {
  it("admin em Todos os setores: os três alertas que mais pesam", async () => {
    expect(await faixaDe(ctx("ADMIN", []))).toEqual(["pagar_vencido", "tarefas_atrasadas", "processos_estourados"]);
  });

  it("só do BPO: nada do Societário, do DP nem do Recrutamento", async () => {
    expect(await faixaDe(ctx("SECTOR_USER", ["bpo"]))).toEqual(["pagar_vencido", "tarefas_atrasadas", "pendencias_vencidas"]);
  });

  it("coordenador de DP e Recrutamento: os dele, com as vagas como volume", async () => {
    expect(await faixaDe(ctx("SECTOR_ADMIN", ["dp", "recrutamento"]))).toEqual(["tarefas_atrasadas", "ferias_vencidas", "vagas_abertas"]);
  });

  it("setor sem painel (Contábil): só as tarefas", async () => {
    expect(await faixaDe(ctx("SECTOR_USER", ["contabil"]))).toEqual(["tarefas_atrasadas"]);
  });

  it("admin com setor ativo no Societário: só o que é dele", async () => {
    expect(await faixaDe(ctx("ADMIN", [], { activeSector: "societario" }))).toEqual(["tarefas_atrasadas", "processos_estourados"]);
  });

  it("Diretoria (somente leitura) não vê as contas, que pedem agir", async () => {
    expect(await faixaDe(ctx("READONLY", []))).toEqual(["tarefas_atrasadas", "pendencias_vencidas", "ferias_vencidas"]);
  });

  it("painel oculto em Personalizar sai da faixa, e o seguinte sobe", async () => {
    const semContas = serializeHomeWidgets(
      DEFAULT_HOME_WIDGETS.filter((k) => k !== "painel-contas"),
      ["painel-contas"]
    );
    expect(await faixaDe(ctx("SECTOR_USER", ["bpo"]), semContas)).toEqual(["tarefas_atrasadas", "pendencias_vencidas", "pagar_esta_semana"]);
  });

  it("módulo de contas a pagar desligado: o BPO vê o vencido a receber", async () => {
    estados.lista = estados.lista.map((e) => (e.code === "bpo_contas_pagar" ? { ...e, enabled: false } : e));
    expect((await faixaDe(ctx("SECTOR_USER", ["bpo"])))[0]).toBe("receber_vencido");
  });
});
