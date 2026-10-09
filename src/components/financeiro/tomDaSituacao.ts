import type { VarianteDoBadge } from "@/components/ui/Badge";

/**
 * A cor de cada situação do BPO, num mapa só (08/10/2026).
 *
 * A auditoria de 07/10 achou a mesma situação em três cores: "Cancelada" saía
 * azul em contas (igual a "A vencer", na mesma coluna) e vermelha em
 * lançamentos e pendências; "Inativa" saía azul nos cadastros e nas alçadas,
 * vermelha na conta bancária e âmbar no plano de contas. A causa era o `Badge`
 * não ter tom neutro — ganhou `neutral` na base —, e cada tela escolhia o seu.
 * As telas do BPO leem a cor daqui; os mapas próprios (situação da conta,
 * status da pendência, do lançamento) apontam para cá.
 *
 * A regra, por papel:
 * - `danger`  — já custa ou deu errado: vencida, perda;
 * - `warning` — pede atenção ou espera alguém: vence hoje, a conferir;
 * - `info`    — em curso, sem urgência: a vencer, em aberto, renegociada;
 * - `success` — resolvido ou valendo: paga, ativa, ligada;
 * - `neutral` — saiu de cena: cancelada, inativa, desligada, encerrada,
 *   ignorada, desfeita. É histórico, não pede ação — e não pode ter a cor de
 *   quem pede.
 *
 * Situação de uma linha sai no `Selo` (`tomDaVariante(TOM_DA_SITUACAO.X)`);
 * ativo/inativo de cadastro, na bolinha (`StatusDot`) — escolha 2A do Kauan,
 * 08/10/2026. O `Badge` fica para categoria em destaque.
 */
export const TOM_DA_SITUACAO = {
  VENCIDA: "danger",
  PERDA: "danger",
  VENCE_HOJE: "warning",
  A_CONFERIR: "warning",
  A_VENCER: "info",
  EM_ABERTO: "info",
  RENEGOCIADA: "info",
  PAGA: "success",
  ATIVA: "success",
  LIGADA: "success",
  CANCELADA: "neutral",
  INATIVA: "neutral",
  DESLIGADA: "neutral",
  ENCERRADA: "neutral",
  // Transação do extrato posta de lado, acordo desfeito (08/10/2026): eram
  // `info` e `warning`, cores de quem ainda está em curso.
  IGNORADA: "neutral",
  DESFEITA: "neutral",
} as const satisfies Record<string, VarianteDoBadge>;

/**
 * O fechamento de uma conta cancelada, quando ela diz o nome: renegociada (a
 * dívida segue num acordo) e perda (alguém deu por perdida) não são o
 * "cancelada" neutro — continuam com a cor da cobrança.
 */
export function tomDoFechamento(closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null): VarianteDoBadge {
  if (closeReason === "RENEGOCIADO") return TOM_DA_SITUACAO.RENEGOCIADA;
  if (closeReason === "PERDA") return TOM_DA_SITUACAO.PERDA;
  return TOM_DA_SITUACAO.CANCELADA;
}
