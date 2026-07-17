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
