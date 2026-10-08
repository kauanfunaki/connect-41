import { Selo } from "@/components/ui/Selo";
import { formatarNumero } from "@/lib/format";
import type {
  AbsenceStatus,
  AbsenceType,
  DayType,
  OvertimeStatus,
  ScheduleStatus,
  TerminationStatus,
  TerminationType,
  TrainingParticipantStatus,
  VacationStatus,
} from "@/generated/prisma/enums";

/**
 * Rótulos e cores dos registros de DP, num lugar só.
 *
 * Moravam dentro de cada linha da ficha (`AfastamentoRow`, `FeriasRow`…) e em
 * cópia nas listas do setor. Em 30/09 as listas viraram tabela com funil por
 * coluna, e o funil precisa do mesmo texto no servidor — por isso este arquivo
 * não tem "use client": a página (servidor) e a linha da ficha (cliente)
 * importam daqui, e "Retorno previsto" não diverge entre as duas.
 */

export const TIPO_DO_AFASTAMENTO: Record<AbsenceType, string> = {
  FALTA: "Falta",
  ATESTADO_PARCIAL: "Atestado parcial",
  ATESTADO_INTEGRAL: "Atestado integral",
  LICENCA: "Licença",
  AFASTAMENTO: "Afastamento",
  RETORNO: "Retorno",
};

export const SITUACAO_DO_AFASTAMENTO: Record<AbsenceStatus, string> = {
  LANCADO: "Lançado",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  AFASTADO: "Afastado",
  RETORNO_PREVISTO: "Retorno previsto",
  CONCLUIDO: "Concluído",
};

export const COR_DO_AFASTAMENTO: Record<AbsenceStatus, string> = {
  LANCADO: "bg-surface-2 text-fg-muted border-border",
  EM_ANALISE: "bg-warning/10 text-warning-fg border-warning/25",
  APROVADO: "bg-brand/10 text-brand border-brand/25",
  // Reprovado é o pedido indeferido: saiu de cena, em cinza, como o cancelado
  // (escolha 2A do Kauan, 08/10/2026 — situação encerrada é neutra).
  REPROVADO: "bg-surface-2 text-fg-muted border-border",
  AFASTADO: "bg-warning/10 text-warning-fg border-warning/25",
  RETORNO_PREVISTO: "bg-brand/10 text-brand border-brand/25",
  CONCLUIDO: "bg-success/10 text-success-fg border-success/25",
};

export const TIPO_DO_DESLIGAMENTO: Record<TerminationType, string> = {
  VOLUNTARIO: "Voluntário",
  INVOLUNTARIO: "Involuntário",
  TERMINO_CONTRATO: "Término de contrato",
  EXPERIENCIA: "Experiência",
  JUSTA_CAUSA: "Justa causa",
  SEM_JUSTA_CAUSA: "Sem justa causa",
  ACORDO_484A: "Acordo entre as partes (art. 484-A)",
  RESCISAO_INDIRETA: "Rescisão indireta",
};

export const SITUACAO_DO_DESLIGAMENTO: Record<TerminationStatus, string> = {
  SOLICITADO: "Solicitado",
  EM_CALCULO: "Em cálculo",
  DOCUMENTACAO_PENDENTE: "Documentação pendente",
  ASSINATURA_PENDENTE: "Assinatura pendente",
  FINALIZADO: "Finalizado",
  CANCELADO: "Cancelado",
};

export const COR_DO_DESLIGAMENTO: Record<TerminationStatus, string> = {
  SOLICITADO: "bg-surface-2 text-fg-muted border-border",
  EM_CALCULO: "bg-warning/10 text-warning-fg border-warning/25",
  DOCUMENTACAO_PENDENTE: "bg-warning/10 text-warning-fg border-warning/25",
  ASSINATURA_PENDENTE: "bg-warning/10 text-warning-fg border-warning/25",
  FINALIZADO: "bg-success/10 text-success-fg border-success/25",
  // Cancelado saiu de cena: neutro, e não vermelho (07/10/2026 — o `neutral`
  // do Badge que a base criou para "Cancelada", "Inativa", "Encerrada").
  CANCELADO: "bg-surface-2 text-fg-muted border-border",
};

export const SITUACAO_DAS_FERIAS: Record<VacationStatus, string> = {
  PLANEJADA: "Planejada",
  SOLICITADA: "Solicitada",
  EM_ANALISE: "Em análise",
  APROVADA: "Aprovada",
  PROGRAMADA: "Programada",
  EM_GOZO: "Em gozo",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const COR_DAS_FERIAS: Record<VacationStatus, string> = {
  PLANEJADA: "bg-surface-2 text-fg-muted border-border",
  SOLICITADA: "bg-brand/10 text-brand border-brand/25",
  EM_ANALISE: "bg-warning/10 text-warning-fg border-warning/25",
  APROVADA: "bg-brand/10 text-brand border-brand/25",
  PROGRAMADA: "bg-brand/10 text-brand border-brand/25",
  EM_GOZO: "bg-success/10 text-success-fg border-success/25",
  CONCLUIDA: "bg-success/10 text-success-fg border-success/25",
  CANCELADA: "bg-surface-2 text-fg-muted border-border",
};

export const TIPO_DO_DIA: Record<DayType, string> = {
  UTIL: "Dia útil",
  FOLGA: "Folga",
  DOMINGO: "Domingo",
  FERIADO: "Feriado",
  NOTURNO: "Noturno",
};

export const SITUACAO_DA_HORA_EXTRA: Record<OvertimeStatus, string> = {
  LANCADO: "Lançado",
  PENDENTE_APROVACAO: "Pendente de aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  ENVIADO_FOLHA: "Enviado para folha",
};

export const COR_DA_HORA_EXTRA: Record<OvertimeStatus, string> = {
  LANCADO: "bg-surface-2 text-fg-muted border-border",
  PENDENTE_APROVACAO: "bg-warning/10 text-warning-fg border-warning/25",
  APROVADO: "bg-success/10 text-success-fg border-success/25",
  // Lançamento reprovado é indeferido: neutro (2A, 08/10/2026).
  REPROVADO: "bg-surface-2 text-fg-muted border-border",
  ENVIADO_FOLHA: "bg-brand/10 text-brand border-brand/25",
};

export const SITUACAO_DA_ESCALA: Record<ScheduleStatus, string> = {
  PLANEJADA: "Planejada",
  CONFIRMADA: "Confirmada",
  ALTERADA: "Alterada",
  CANCELADA: "Cancelada",
  REALIZADA: "Realizada",
};

export const COR_DA_ESCALA: Record<ScheduleStatus, string> = {
  PLANEJADA: "bg-surface-2 text-fg-muted border-border",
  CONFIRMADA: "bg-brand/10 text-brand border-brand/25",
  ALTERADA: "bg-warning/10 text-warning-fg border-warning/25",
  CANCELADA: "bg-surface-2 text-fg-muted border-border",
  REALIZADA: "bg-success/10 text-success-fg border-success/25",
};

export const SITUACAO_DO_PARTICIPANTE: Record<TrainingParticipantStatus, string> = {
  PLANEJADO: "Planejado",
  CONVOCADO: "Convocado",
  REALIZADO: "Realizado",
  AUSENTE: "Ausente",
  REPROVADO: "Reprovado",
  CONCLUIDO: "Concluído",
  VENCIDO: "Vencido",
};

export const COR_DO_PARTICIPANTE: Record<TrainingParticipantStatus, string> = {
  PLANEJADO: "bg-surface-2 text-fg-muted border-border",
  CONVOCADO: "bg-brand/10 text-brand border-brand/25",
  REALIZADO: "bg-success/10 text-success-fg border-success/25",
  AUSENTE: "bg-warning/10 text-warning-fg border-warning/25",
  REPROVADO: "bg-danger/10 text-danger border-danger/25",
  CONCLUIDO: "bg-success/10 text-success-fg border-success/25",
  VENCIDO: "bg-danger/10 text-danger border-danger/25",
};

/**
 * Horas e notas do DP em pt-BR. O decimal do banco ia cru para a tela ("3.5h",
 * média "8.25"), na mesma área em que Gestão e Valora mostram "3,5 h"
 * (auditoria DRG-02, 07/10/2026). Duas casas porque as colunas são
 * `Decimal(…, 2)`: "1,25 h" não pode virar "1,3 h" — por isso não é o
 * `formatarHoras` (uma casa), e sim o `formatarNumero` com duas.
 */
export function horasDoDP(v: { toString(): string } | number): string {
  return `${formatarNumero(Number(v.toString()), 2)} h`;
}

export function notaDoDP(v: { toString(): string } | number): string {
  return formatarNumero(Number(v.toString()), 2);
}

/** O selo de situação nas tabelas de DP — a pílula com a cor de um dos mapas acima. */
export function SeloDoDP({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <Selo cor={cor}>{children}</Selo>;
}
