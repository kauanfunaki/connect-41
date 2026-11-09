// O que o detalhe da tarefa mostra em cada campo (05/11/2026, no jeito do
// ClickUp): a tarefa criada só com o nome abre com tudo "Vazio" até alguém
// preencher. Só regra, para o teste e para o painel.

import { formatCalendarDate } from "@/lib/format";
import type { StageType } from "@/generated/prisma/enums";
import type { TomDoSelo } from "@/components/ui/Selo";

export const VAZIO = "Vazio";

/**
 * A situação da tarefa no `Selo`, pelo tipo da etapa (15/10/2026): era um
 * botão vermelho em caixa alta em qualquer etapa, até em "Concluído" — e
 * vermelho é só para o que está em perigo. Aqui, e não no painel, desde
 * 09/11/2026: a tela da solicitação mostra a coluna do cartão no mesmo tom.
 */
export const TOM_DA_ETAPA: Record<StageType, TomDoSelo> = {
  NOT_STARTED: "neutro",
  IN_PROGRESS: "marca",
  PENDING: "atencao",
  DONE: "sucesso",
};

/**
 * Prioridade 0 é "sem prioridade" — a tarefa nasce assim. Era "Normal", e a
 * tarefa recém-criada já aparecia com uma prioridade escolhida.
 */
export const ROTULO_DA_PRIORIDADE: Record<number, string> = { 0: "Sem prioridade", 1: "Alta", 2: "Urgente" };

/** As opções do menu, da mais forte para a ausência — como no ClickUp. */
export const OPCOES_DE_PRIORIDADE = [2, 1, 0] as const;

export function prioridadeNoCampo(prioridade: number): string {
  return prioridade > 0 ? (ROTULO_DA_PRIORIDADE[prioridade] ?? VAZIO) : VAZIO;
}

function dia(valor: string): string {
  return formatCalendarDate(new Date(valor.slice(0, 10)), { day: "2-digit", month: "short" });
}

/** "Vazio" sem datas; com uma ou as duas, "Início → Vencimento" com o que houver. */
export function datasNoCampo(inicio: string | null, vencimento: string | null): string {
  if (!inicio && !vencimento) return VAZIO;
  return `${inicio ? dia(inicio) : "Início"} → ${vencimento ? dia(vencimento) : "Vencimento"}`;
}

/** Os campos que só aparecem preenchidos ou pedidos em "Adicionar campo". */
export const CAMPOS_EXTRAS = ["participantes", "estimativa"] as const;
export type CampoExtra = (typeof CAMPOS_EXTRAS)[number];
export const ROTULO_DO_CAMPO_EXTRA: Record<CampoExtra, string> = {
  participantes: "Participantes",
  estimativa: "Estimativa de tempo",
};

/** Quais extras aparecem: os preenchidos e os que a pessoa pediu agora. */
export function extrasVisiveis(preenchidos: Partial<Record<CampoExtra, boolean>>, pedidos: readonly CampoExtra[]): Set<CampoExtra> {
  return new Set(CAMPOS_EXTRAS.filter((c) => preenchidos[c] || pedidos.includes(c)));
}
