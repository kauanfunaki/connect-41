import type { TomDoSelo } from "@/components/ui/Selo";
import { fechado, type Prioridade, type Status } from "./regras";

/**
 * O tom do selo de cada situação e prioridade do chamado (auditoria de UX,
 * 30/10/2026). Antes toda situação tinha a mesma pílula azul e toda prioridade
 * o mesmo cinza — Urgente igual a Baixa. O texto continua no selo: o tom só
 * reforça, nunca é a única pista.
 */
export const TOM_DA_SITUACAO: Record<Status, TomDoSelo> = {
  ABERTO: "marca",
  NA_FILA: "marca",
  EM_ANDAMENTO: "marca",
  AGUARDANDO_USUARIO: "atencao",
  AGUARDANDO_APROVACAO: "atencao",
  AGUARDANDO_REQUERENTE: "atencao",
  STANDBY: "neutro",
  RESOLVIDO: "sucesso",
  CANCELADO: "neutro",
};

export const TOM_DA_PRIORIDADE: Record<Prioridade, TomDoSelo> = {
  URGENTE: "perigo",
  ALTA: "atencao",
  MEDIA: "neutro",
  BAIXA: "neutro",
};

type Ciclo = { resolutionDueAt: Date; resolvedAt: Date | null; pausedAt: Date | null };

/**
 * O prazo de resolução já passou — o mesmo critério do indicador "atrasados"
 * do relatório: chamado aberto, ciclo sem resolução e sem pausa.
 */
export function slaAtrasado(status: string, ciclo: Ciclo | undefined, agora: Date): boolean {
  if (!ciclo || fechado(status)) return false;
  return !ciclo.resolvedAt && !ciclo.pausedAt && ciclo.resolutionDueAt < agora;
}
