import type { SITUACOES, TIPOS } from "./regras";

// A situação preenche a célula inteira, com a cor que o Tech pediu (26/10/2026):
// Pendente vermelho, Em andamento amarelo, Em validação laranja, Concluído verde.
// Letra escura só no amarelo, onde a branca não passa de 1,7:1. O laranja
// (10/11/2026) era #F0812E com letra quase preta, que o Kauan achou pesada: ficou
// um laranja mais fechado, #B85C00, com letra branca a 4,6:1, o mesmo nível do
// vermelho, do verde e do cinza, e longe do matiz do vermelho.
export const CORES_DA_SITUACAO: Record<keyof typeof SITUACOES, { fundo: string; tinta: string }> = {
  PENDING: { fundo: "#D63B3B", tinta: "#FFFFFF" },
  IN_PROGRESS: { fundo: "#F2C230", tinta: "#3B2C00" },
  VALIDATION: { fundo: "#B85C00", tinta: "#FFFFFF" },
  DONE: { fundo: "#1E8049", tinta: "#FFFFFF" },
  CANCELED: { fundo: "#6B7483", tinta: "#FFFFFF" },
};

// No Kanban e na Agenda, cada tipo tem a sua cor para distinguir os cartões de
// relance; os matizes ficam longe das cores da situação.
export const CORES_DO_TIPO: Record<keyof typeof TIPOS, string> = {
  BUG: "#D9467F", IMPROVEMENT: "#3B7BE8", FEATURE: "#8B5CF6", TEST: "#0F9E9E", MIGRATION: "#A8743A",
};
