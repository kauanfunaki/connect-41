import type { SITUACOES, TIPOS } from "./regras";

// A situação preenche a célula inteira, com a cor que o Tech pediu (26/10/2026):
// Pendente vermelho, Em andamento amarelo, Em validação laranja, Concluído verde.
// Letra escura no amarelo e no laranja: branca ficava abaixo de 3:1.
export const CORES_DA_SITUACAO: Record<keyof typeof SITUACOES, { fundo: string; tinta: string }> = {
  PENDING: { fundo: "#D63B3B", tinta: "#FFFFFF" },
  IN_PROGRESS: { fundo: "#F2C230", tinta: "#3B2C00" },
  VALIDATION: { fundo: "#F0812E", tinta: "#2B1300" },
  DONE: { fundo: "#1E8049", tinta: "#FFFFFF" },
  CANCELED: { fundo: "#6B7483", tinta: "#FFFFFF" },
};

// No Kanban e na Agenda, cada tipo tem a sua cor para distinguir os cartões de
// relance; os matizes ficam longe das cores da situação.
export const CORES_DO_TIPO: Record<keyof typeof TIPOS, string> = {
  BUG: "#D9467F", IMPROVEMENT: "#3B7BE8", FEATURE: "#8B5CF6", TEST: "#0F9E9E", MIGRATION: "#A8743A",
};
