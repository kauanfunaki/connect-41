import type { VagaStatus } from "@/generated/prisma/enums";

// Fonte única de rótulo/cor de status de vaga — a lista e o detalhe divergiam
// (a lista coloria o badge, o detalhe renderizava sempre neutro).

export const VAGA_STATUS_LABEL: Record<VagaStatus, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  ENCERRADA: "Encerrada",
  CANCELADA: "Cancelada",
};

// Semântica da cor segue a saúde do processo, não a ordem do ciclo de vida:
// aberta/em andamento são estados saudáveis (verde/azul), encerrada é neutra
// (concluiu, não é "sucesso" nem alerta) e cancelada é o desfecho negativo.
export const VAGA_STATUS_STYLE: Record<VagaStatus, string> = {
  ABERTA: "bg-success/10 text-success border-success/25",
  EM_ANDAMENTO: "bg-brand/10 text-brand border-brand/25",
  ENCERRADA: "bg-surface-2 text-fg-secondary border-border",
  CANCELADA: "bg-danger/10 text-danger border-danger/25",
};

export const VAGA_STATUS_ORDER: VagaStatus[] = ["ABERTA", "EM_ANDAMENTO", "ENCERRADA", "CANCELADA"];
