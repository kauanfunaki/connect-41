import type { HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";

// Vocabulário do dia a dia (item 6 do levantamento): a transferência nasce
// "Nova", vira "Resolvendo" quando algum setor começa a trabalhar e
// "Finalizada" quando todos terminam.
export const HANDOFF_STATUS_LABEL: Record<HandoffSectorStatus, string> = {
  NEW: "Nova",
  IN_PROGRESS: "Resolvendo",
  DONE: "Finalizada",
};

export const HANDOFF_STATUS_BADGE: Record<HandoffSectorStatus, "warning" | "info" | "success"> = {
  NEW: "warning",
  IN_PROGRESS: "info",
  DONE: "success",
};

export const HANDOFF_PRIORITY_LABEL: Record<HandoffPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const HANDOFF_PRIORITY_BADGE: Record<HandoffPriority, "info" | "success" | "warning" | "danger"> = {
  LOW: "success",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export const HANDOFF_PRIORITY_OPTIONS: { value: HandoffPriority; label: string }[] = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

// Status agregado da transferência a partir dos status por setor.
export function aggregateHandoffStatus(statuses: HandoffSectorStatus[]): HandoffSectorStatus {
  if (statuses.length === 0) return "NEW";
  if (statuses.every((s) => s === "DONE")) return "DONE";
  if (statuses.every((s) => s === "NEW")) return "NEW";
  return "IN_PROGRESS";
}

// Quem pode LER a instrução escrita para um setor.
//
// A instrução é conteúdo dirigido a UM setor — diferente da mensagem da
// transferência, que é para todos os envolvidos. Ver a transferência não dá
// direito de ler o que foi dito a outro setor. Achado na conferência ao vivo
// de 2026-08-24: quem estava no setor X lia a instrução do setor Y, porque a
// tela de detalhe só tinha guarda para EDITAR (canManageSector/isAssignee),
// nenhuma para ler.
//
// O card do setor continua visível para todo mundo, de propósito: escondê-lo
// faria o status agregado depender de um setor invisível na tela, e quem
// acompanha não entenderia por que a transferência não fecha.
//
// Usa os setores da PESSOA (`userSectors`), não o setor ativo do subworkspace:
// trocar de subworkspace muda o que se lista, não o que se tem direito de ler
// — mesma razão pela qual `scopedHandoffWhere` também ignora o setor ativo.
export function canReadSectorInstruction(params: {
  /** Papel dá visão geral do tenant (ADMIN, SUPER_ADMIN, READONLY). */
  fullAccess: boolean;
  /** Id de quem está olhando. Null = sessão sem usuário. */
  userId: string | null;
  /** Quem abriu a transferência — escreveu as instruções, então lê todas. */
  requestedBy: string;
  /** Setores da pessoa (UserSector), não o setor ativo. */
  userSectors: string[];
  /** Setor do card. */
  sectorCode: string;
  /** Responsável designado pode ser de fora do setor — e precisa da instrução. */
  isAssignee: boolean;
}): boolean {
  const { fullAccess, userId, requestedBy, userSectors, sectorCode, isAssignee } = params;
  if (fullAccess) return true;
  if (userId !== null && userId === requestedBy) return true;
  if (userSectors.includes(sectorCode)) return true;
  return isAssignee;
}
