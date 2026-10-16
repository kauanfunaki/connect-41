import { describe, expect, it } from "vitest";
import {
  botoesDeSituacao,
  contarSituacoes,
  diasAteARenovacao,
  emSomenteLeitura,
  filtrarPorSituacao,
  historicoDaAssinatura,
  medidorDeUsuarios,
  mensalidadeDaLinha,
  textoDaRenovacao,
  totaisDasAssinaturas,
  type AssinaturaDaLinha,
  type LinhaDaAssinatura,
  type LinhaDoLog,
} from "./painel";

// Administração › Assinaturas, escolha A do Kauan (14/10/2026): os números do
// topo, os botões de situação, os dias até a renovação, a barra de usuários e o
// histórico tirado da Auditoria.

const fixo = { id: "p-ger", nome: "Gerenciado", cobranca: "FLAT_MONTHLY" as const, valorMensal: 1500, valorPorUsuario: 0 };
const porUsuario = { id: "p-auto", nome: "Autoatendimento", cobranca: "PER_USER_MONTHLY" as const, valorMensal: 0, valorPorUsuario: 89.9 };

function linha(nome: string, modo: LinhaDaAssinatura["modo"], usuarios: number, a: Partial<AssinaturaDaLinha> | null): LinhaDaAssinatura {
  return {
    tenantId: nome.toLowerCase(),
    nome,
    logoUrl: null,
    modo,
    usuariosAtivos: usuarios,
    assinatura: a
      ? {
          planId: a.plano?.id ?? "p-ger",
          plano: fixo,
          status: "ACTIVE",
          seatLimit: null,
          inicio: "2026-09-02T12:00:00.000Z",
          renovacao: null,
          implantacaoValor: null,
          implantacaoPagaEm: "2026-09-10T12:00:00.000Z",
          notes: null,
          ...a,
        }
      : null,
  };
}

const LINHAS = [
  linha("41 Tech", "MANAGED", 12, { status: "ACTIVE" }),
  linha("Alfa", "MANAGED", 11, { status: "PAST_DUE" }),
  linha("Beta", "SELF_SERVICE", 8, { status: "ACTIVE", plano: porUsuario, seatLimit: 10, implantacaoPagaEm: null }),
  linha("Teste", "MANAGED", 3, null),
  linha("Gama", "SELF_SERVICE", 5, { status: "PAST_DUE", plano: porUsuario, seatLimit: 5 }),
  linha("Delta", "SELF_SERVICE", 2, { status: "TRIAL", plano: porUsuario }),
];

describe("os números do topo", () => {
  it("clientes, com assinatura, ativas (com implantação pendente) e em atraso", () => {
    const t = totaisDasAssinaturas(LINHAS);
    expect(t.clientes).toBe(6);
    expect(t.comAssinatura).toBe(5);
    expect(t.ativas).toBe(2);
    expect(t.ativasComImplantacaoPendente).toBe(1);
    expect(t.emAtraso).toBe(2);
  });

  // Regra de 04/08/2026 (subscription-policy): em atraso bloqueia nos dois
  // modos. A tela antiga dizia "sem efeito" para o Gerenciado.
  it("em atraso já em somente leitura conta o gerenciado também", () => {
    expect(totaisDasAssinaturas(LINHAS).emAtrasoEmSomenteLeitura).toBe(2);
    expect(emSomenteLeitura(LINHAS[1]!)).toBe(true);
    expect(emSomenteLeitura(LINHAS[3]!)).toBe(false);
  });

  it("a mensalidade prevista soma valor fixo e usuário × valor, só de ativas e em atraso", () => {
    // 41 Tech 1500 + Alfa 1500 + Beta 8 × 89,90 + Gama 5 × 89,90; Delta (em teste) e Teste (sem assinatura) fora.
    expect(totaisDasAssinaturas(LINHAS).mensalidadePrevista).toBe(4168.7);
    expect(mensalidadeDaLinha(LINHAS[5]!)).toBeNull();
    expect(mensalidadeDaLinha(LINHAS[3]!)).toBeNull();
    expect(mensalidadeDaLinha(linha("Cancelada", "MANAGED", 4, { status: "CANCELED" }))).toBeNull();
  });

  it("assinatura com plano removido não entra na conta", () => {
    expect(mensalidadeDaLinha(linha("Sem plano", "MANAGED", 4, { plano: null }))).toBeNull();
  });
});

describe("os botões de situação", () => {
  it("contam cada situação e o total", () => {
    expect(contarSituacoes(LINHAS)).toEqual({ todas: 6, ACTIVE: 2, TRIAL: 1, PAST_DUE: 2, CANCELED: 0, SEM: 1 });
  });

  it("filtram a lista", () => {
    expect(filtrarPorSituacao(LINHAS, "PAST_DUE").map((l) => l.nome)).toEqual(["Alfa", "Gama"]);
    expect(filtrarPorSituacao(LINHAS, "SEM").map((l) => l.nome)).toEqual(["Teste"]);
    expect(filtrarPorSituacao(LINHAS, "todas")).toHaveLength(6);
  });

  it("Canceladas só aparece quando há alguma", () => {
    expect(botoesDeSituacao(contarSituacoes(LINHAS)).map((b) => b.rotulo)).toEqual(["Todas", "Ativas", "Em teste", "Em atraso", "Sem assinatura"]);
    const comCancelada = [...LINHAS, linha("Ômega", "MANAGED", 1, { status: "CANCELED" })];
    const botoes = botoesDeSituacao(contarSituacoes(comCancelada));
    expect(botoes.map((b) => b.rotulo)).toEqual(["Todas", "Ativas", "Em teste", "Em atraso", "Canceladas", "Sem assinatura"]);
    expect(botoes.find((b) => b.filtro === "CANCELED")?.n).toBe(1);
  });
});

describe("renovação", () => {
  it("conta os dias pelo calendário, sem fuso", () => {
    expect(diasAteARenovacao("2026-11-01", "2026-10-14")).toBe(18);
    expect(diasAteARenovacao("2026-10-05", "2026-10-14")).toBe(-9);
    expect(diasAteARenovacao("2026-10-14", "2026-10-14")).toBe(0);
    // Atravessa o fim do horário de verão e o fim do ano sem perder um dia.
    expect(diasAteARenovacao("2027-01-01", "2026-12-31")).toBe(1);
    expect(diasAteARenovacao("2027-03-01", "2026-10-14")).toBe(138);
  });

  it("escreve em X dias, vence hoje ou venceu há X dias (em vermelho)", () => {
    expect(textoDaRenovacao(18)).toEqual({ texto: "em 18 dias", vencida: false });
    expect(textoDaRenovacao(1)).toEqual({ texto: "amanhã", vencida: false });
    expect(textoDaRenovacao(0)).toEqual({ texto: "vence hoje", vencida: false });
    expect(textoDaRenovacao(-1)).toEqual({ texto: "venceu ontem", vencida: true });
    expect(textoDaRenovacao(-9)).toEqual({ texto: "venceu há 9 dias", vencida: true });
  });
});

describe("a barra de usuários", () => {
  it("no autoatendimento com limite: 8 de 10", () => {
    expect(medidorDeUsuarios("SELF_SERVICE", 10, 8)).toEqual({ tipo: "limite", usados: 8, limite: 10, porcento: 80, cheio: false });
  });

  it("no limite fica cheia, e acima do limite não passa de 100%", () => {
    expect(medidorDeUsuarios("SELF_SERVICE", 5, 5)).toMatchObject({ porcento: 100, cheio: true });
    expect(medidorDeUsuarios("SELF_SERVICE", 5, 7)).toMatchObject({ porcento: 100, cheio: true, usados: 7 });
  });

  it("no gerenciado, ou sem limite, só quantos há", () => {
    expect(medidorDeUsuarios("MANAGED", 10, 11)).toEqual({ tipo: "sem-limite", usados: 11 });
    expect(medidorDeUsuarios("SELF_SERVICE", null, 4)).toEqual({ tipo: "sem-limite", usados: 4 });
    expect(medidorDeUsuarios("SELF_SERVICE", 0, 4)).toEqual({ tipo: "sem-limite", usados: 4 });
  });
});

describe("o histórico, tirado da Auditoria", () => {
  const planos: Record<string, string> = { "p-ger": "Gerenciado", "p-auto": "Autoatendimento" };
  const nome = (id: string) => planos[id];
  const log = (createdAt: string, action: string, metadata: unknown, quem: string | null = "Carla Mendes"): LinhaDoLog => ({
    action,
    metadata,
    createdAt,
    quem,
  });

  it("diz o que mudou de uma linha para a outra, do mais novo para o mais antigo", () => {
    const h = historicoDaAssinatura(
      [
        // Fora de ordem de propósito: a tela não depende da ordem do banco.
        log("2026-10-13T15:00:00Z", "subscription.update", { planId: "p-auto", status: "ACTIVE", managementMode: "SELF_SERVICE" }),
        log("2026-09-02T12:00:00Z", "subscription.create", { planId: "p-ger", status: "TRIAL", managementMode: "MANAGED" }),
        log("2026-09-20T12:00:00Z", "subscription.update", { planId: "p-auto", status: "TRIAL", managementMode: "SELF_SERVICE" }),
      ],
      nome,
    );
    expect(h.map((e) => `${e.quem} ${e.texto}`)).toEqual([
      "Carla Mendes mudou a situação para Ativa",
      "Carla Mendes trocou o plano para Autoatendimento e trocou o modo para Autoatendimento",
      "Carla Mendes criou a assinatura (plano Gerenciado, Em teste)",
    ]);
    expect(h[0]!.quando).toBe("2026-10-13T15:00:00.000Z");
  });

  it("salvar sem mudar plano, situação nem modo vira editou a assinatura", () => {
    const h = historicoDaAssinatura(
      [
        log("2026-09-02T12:00:00Z", "subscription.create", { planId: "p-ger", status: "ACTIVE", managementMode: "MANAGED" }),
        log("2026-09-03T12:00:00Z", "subscription.update", { planId: "p-ger", status: "ACTIVE", managementMode: "MANAGED" }),
      ],
      nome,
    );
    expect(h[0]!.texto).toBe("editou a assinatura");
  });

  it("a primeira linha sendo uma edição (criada antes da Auditoria) descreve como ficou", () => {
    const h = historicoDaAssinatura([log("2026-09-03T12:00:00Z", "subscription.update", { planId: "p-velho", status: "PAST_DUE" })], nome);
    expect(h[0]!.texto).toBe("editou a assinatura (plano um plano removido, Em atraso)");
  });

  it("sem nome de quem fez, Alguém; metadado estranho e outras ações não quebram", () => {
    const h = historicoDaAssinatura(
      [
        log("2026-09-02T12:00:00Z", "subscription.create", null, null),
        log("2026-09-03T12:00:00Z", "subscription_plan.update", { name: "x" }),
        log("2026-09-04T12:00:00Z", "subscription.update", ["lista"], "  "),
      ],
      nome,
    );
    expect(h.map((e) => `${e.quem} ${e.texto}`)).toEqual(["Alguém editou a assinatura", "Alguém criou a assinatura"]);
  });
});
