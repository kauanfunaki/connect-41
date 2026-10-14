// As contas da tela Administração › Assinaturas (14/10/2026, escolha A do
// Kauan: "tabela com totais e painel de edição") — os números do topo, os
// botões de situação com a contagem, os dias até a renovação, a barra de
// usuários e o histórico tirado da Auditoria.
//
// Puro (sem banco): a página monta as linhas e passa para cá; os testes
// conferem as contas sem tela.
//
// Somente leitura: a regra é a de `isSubscriptionReadOnly`
// (src/lib/subscription-policy.ts) — em atraso ou cancelada bloqueia, nos dois
// modos de gestão, desde a mudança de política de 04/08/2026. A tela antiga
// ainda dizia "sem efeito" para o Gerenciado, o que já não era verdade.

import type { BillingType, ManagementMode, SubscriptionStatus } from "@/generated/prisma/enums";
import { isSubscriptionReadOnly } from "@/lib/subscription-policy";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/subscription-labels";

export type PlanoDaLinha = {
  id: string;
  nome: string;
  cobranca: BillingType;
  /** Valor mensal do plano de valor fixo, em reais. */
  valorMensal: number;
  /** Valor por usuário ativo, em reais (cobrança por usuário). */
  valorPorUsuario: number;
};

export type AssinaturaDaLinha = {
  planId: string;
  /** `null` se o plano da assinatura sumiu do catálogo. */
  plano: PlanoDaLinha | null;
  status: SubscriptionStatus;
  seatLimit: number | null;
  /** Início da assinatura (instante, ISO). */
  inicio: string;
  /** Próxima renovação, data-calendário "AAAA-MM-DD". */
  renovacao: string | null;
  implantacaoValor: string | null;
  /** Quando a implantação foi marcada como paga (instante, ISO). */
  implantacaoPagaEm: string | null;
  notes: string | null;
};

export type LinhaDaAssinatura = {
  tenantId: string;
  nome: string;
  logoUrl: string | null;
  modo: ManagementMode;
  usuariosAtivos: number;
  assinatura: AssinaturaDaLinha | null;
};

/** O filtro da tela: as situações da assinatura, mais "sem assinatura". */
export type FiltroDeSituacao = "todas" | SubscriptionStatus | "SEM";

export function situacaoDaLinha(l: LinhaDaAssinatura): SubscriptionStatus | "SEM" {
  return l.assinatura?.status ?? "SEM";
}

/** O cliente está em somente leitura por causa da assinatura? Sem assinatura, nunca. */
export function emSomenteLeitura(l: LinhaDaAssinatura): boolean {
  return isSubscriptionReadOnly(l.assinatura?.status);
}

export function contarSituacoes(linhas: readonly LinhaDaAssinatura[]): Record<FiltroDeSituacao, number> {
  const n: Record<FiltroDeSituacao, number> = { todas: linhas.length, ACTIVE: 0, TRIAL: 0, PAST_DUE: 0, CANCELED: 0, SEM: 0 };
  for (const l of linhas) n[situacaoDaLinha(l)] += 1;
  return n;
}

export function filtrarPorSituacao(linhas: readonly LinhaDaAssinatura[], filtro: FiltroDeSituacao): LinhaDaAssinatura[] {
  return filtro === "todas" ? [...linhas] : linhas.filter((l) => situacaoDaLinha(l) === filtro);
}

/** Os botões de situação, na ordem da tela. "Canceladas" só aparece quando há alguma. */
export function botoesDeSituacao(contagem: Record<FiltroDeSituacao, number>): { filtro: FiltroDeSituacao; rotulo: string; n: number }[] {
  const botoes: { filtro: FiltroDeSituacao; rotulo: string; n: number }[] = [
    { filtro: "todas", rotulo: "Todas", n: contagem.todas },
    { filtro: "ACTIVE", rotulo: "Ativas", n: contagem.ACTIVE },
    { filtro: "TRIAL", rotulo: "Em teste", n: contagem.TRIAL },
    { filtro: "PAST_DUE", rotulo: "Em atraso", n: contagem.PAST_DUE },
    { filtro: "SEM", rotulo: "Sem assinatura", n: contagem.SEM },
  ];
  if (contagem.CANCELED > 0) botoes.splice(4, 0, { filtro: "CANCELED", rotulo: "Canceladas", n: contagem.CANCELED });
  return botoes;
}

/**
 * Quanto a assinatura deve render por mês: o valor fixo do plano, ou o valor
 * por usuário × usuários ativos. Só conta o que se cobra — ativa e em atraso;
 * em teste e cancelada não entram. É estimativa: não há registro de pagamento.
 */
export function mensalidadeDaLinha(l: LinhaDaAssinatura): number | null {
  const a = l.assinatura;
  if (!a?.plano || (a.status !== "ACTIVE" && a.status !== "PAST_DUE")) return null;
  return a.plano.cobranca === "PER_USER_MONTHLY" ? a.plano.valorPorUsuario * l.usuariosAtivos : a.plano.valorMensal;
}

export type TotaisDasAssinaturas = {
  clientes: number;
  comAssinatura: number;
  ativas: number;
  /** Das ativas, quantas ainda não pagaram a implantação. */
  ativasComImplantacaoPendente: number;
  emAtraso: number;
  /** Das em atraso, quantas já estão em somente leitura (pela regra de hoje, todas). */
  emAtrasoEmSomenteLeitura: number;
  mensalidadePrevista: number;
};

export function totaisDasAssinaturas(linhas: readonly LinhaDaAssinatura[]): TotaisDasAssinaturas {
  let mensalidade = 0;
  for (const l of linhas) mensalidade += mensalidadeDaLinha(l) ?? 0;
  return {
    clientes: linhas.length,
    comAssinatura: linhas.filter((l) => l.assinatura).length,
    ativas: linhas.filter((l) => l.assinatura?.status === "ACTIVE").length,
    ativasComImplantacaoPendente: linhas.filter((l) => l.assinatura?.status === "ACTIVE" && !l.assinatura.implantacaoPagaEm).length,
    emAtraso: linhas.filter((l) => l.assinatura?.status === "PAST_DUE").length,
    emAtrasoEmSomenteLeitura: linhas.filter((l) => l.assinatura?.status === "PAST_DUE" && emSomenteLeitura(l)).length,
    // Centavos inteiros: somar reais em ponto flutuante deixa 0,30000000004.
    mensalidadePrevista: Math.round(mensalidade * 100) / 100,
  };
}

/** Dias de hoje até a renovação ("AAAA-MM-DD" nos dois): negativo é vencida. */
export function diasAteARenovacao(renovacao: string, hoje: string): number {
  const dia = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(a!, m! - 1, d!);
  };
  return Math.round((dia(renovacao) - dia(hoje)) / 86_400_000);
}

/** "em 18 dias", "vence hoje", "venceu há 9 dias" — e se pinta de vermelho. */
export function textoDaRenovacao(dias: number): { texto: string; vencida: boolean } {
  if (dias === 0) return { texto: "vence hoje", vencida: false };
  if (dias > 0) return { texto: dias === 1 ? "amanhã" : `em ${dias} dias`, vencida: false };
  const atras = -dias;
  return { texto: atras === 1 ? "venceu ontem" : `venceu há ${atras} dias`, vencida: true };
}

/**
 * A coluna Usuários. O limite só vale no autoatendimento (src/lib/subscriptions,
 * `canAddUser`): lá, a barra "8 de 10", vermelha quando chega no limite; no
 * gerenciado, ou sem limite definido, só quantos usuários ativos há.
 */
export type MedidorDeUsuarios =
  | { tipo: "limite"; usados: number; limite: number; porcento: number; cheio: boolean }
  | { tipo: "sem-limite"; usados: number };

export function medidorDeUsuarios(modo: ManagementMode, seatLimit: number | null | undefined, usados: number): MedidorDeUsuarios {
  if (modo !== "SELF_SERVICE" || seatLimit == null || seatLimit <= 0) return { tipo: "sem-limite", usados };
  return {
    tipo: "limite",
    usados,
    limite: seatLimit,
    porcento: Math.min(100, Math.round((usados / seatLimit) * 100)),
    cheio: usados >= seatLimit,
  };
}

// ─── Histórico ────────────────────────────────────────────────────────────────
//
// Não há tabela de histórico da assinatura: cada "Salvar" grava na Auditoria
// (`subscription.create`/`subscription.update`) o plano, a situação e o modo de
// gestão como ficaram. O histórico compara cada linha com a anterior e diz o
// que mudou. Só cobre esses três — renovação, limite e implantação não vão
// para a Auditoria com o valor.

export const ACOES_DO_HISTORICO = ["subscription.create", "subscription.update"] as const;

export type LinhaDoLog = {
  action: string;
  metadata: unknown;
  /** Instante (ISO ou Date). */
  createdAt: string | Date;
  /** Quem agiu — o nome guardado na linha, ou o do usuário. */
  quem: string | null;
};

export type EntradaDoHistorico = { quando: string; quem: string; texto: string };

type Retrato = { planId?: string; status?: SubscriptionStatus; modo?: ManagementMode };

const MODO_CURTO: Record<ManagementMode, string> = { MANAGED: "Gerenciado", SELF_SERVICE: "Autoatendimento" };

function retratoDoLog(metadata: unknown): Retrato {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const m = metadata as Record<string, unknown>;
  const status = typeof m.status === "string" && m.status in SUBSCRIPTION_STATUS_LABEL ? (m.status as SubscriptionStatus) : undefined;
  const modo = m.managementMode === "MANAGED" || m.managementMode === "SELF_SERVICE" ? m.managementMode : undefined;
  return { planId: typeof m.planId === "string" ? m.planId : undefined, status, modo };
}

/** "a, b e c". */
function emFrase(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/**
 * O histórico de uma assinatura, do mais novo para o mais antigo, a partir das
 * linhas da Auditoria dela (em qualquer ordem). `nomeDoPlano` traduz o id do
 * plano; plano que não existe mais vira "um plano removido".
 */
export function historicoDaAssinatura(
  linhas: readonly LinhaDoLog[],
  nomeDoPlano: (id: string) => string | undefined,
): EntradaDoHistorico[] {
  const plano = (id: string) => nomeDoPlano(id) ?? "um plano removido";
  const emOrdem = linhas
    .filter((l) => (ACOES_DO_HISTORICO as readonly string[]).includes(l.action))
    .map((l) => ({ ...l, quando: new Date(l.createdAt).toISOString() }))
    .sort((a, b) => a.quando.localeCompare(b.quando));

  const entradas: EntradaDoHistorico[] = [];
  let anterior: Retrato | null = null;
  for (const l of emOrdem) {
    const agora = retratoDoLog(l.metadata);
    const detalhes = [agora.planId && `plano ${plano(agora.planId)}`, agora.status && SUBSCRIPTION_STATUS_LABEL[agora.status]].filter(
      (d): d is string => Boolean(d),
    );
    let texto: string;
    if (l.action === "subscription.create" || !anterior) {
      const verbo = l.action === "subscription.create" ? "criou a assinatura" : "editou a assinatura";
      texto = detalhes.length ? `${verbo} (${detalhes.join(", ")})` : verbo;
    } else {
      const mudancas: string[] = [];
      if (agora.status && agora.status !== anterior.status) mudancas.push(`mudou a situação para ${SUBSCRIPTION_STATUS_LABEL[agora.status]}`);
      if (agora.planId && agora.planId !== anterior.planId) mudancas.push(`trocou o plano para ${plano(agora.planId)}`);
      if (agora.modo && agora.modo !== anterior.modo) mudancas.push(`trocou o modo para ${MODO_CURTO[agora.modo]}`);
      texto = mudancas.length ? emFrase(mudancas) : "editou a assinatura";
    }
    entradas.push({ quando: l.quando, quem: l.quem?.trim() || "Alguém", texto });
    anterior = { ...(anterior ?? {}), ...Object.fromEntries(Object.entries(agora).filter(([, v]) => v !== undefined)) };
  }
  return entradas.reverse();
}
