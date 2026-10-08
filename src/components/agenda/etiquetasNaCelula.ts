// Quantas etiquetas (prazos e reuniões) cabem numa célula da visão de mês.
//
// Era um teto fixo de 3 (até 07/10/2026), mas a célula tem altura fixa (as 6
// semanas dividem a altura da tela) e, a 1600×900, só comportava umas 2: a 3ª
// saía cortada ao meio e o "+N mais" ficava escondido embaixo dela. Agora a
// conta sai da altura medida da célula, e quando não cabem todas uma linha
// fica sempre reservada para o "+N mais".

/** Chip da reunião: 3px em cima e embaixo + uma linha de 11px. O do prazo tem 20px. */
export const ALTURA_DA_ETIQUETA = 23;
/** `space-y-0.5` entre as etiquetas. */
export const VAO_ENTRE_ETIQUETAS = 2;
/** O link "+N mais": uma linha de 11px. */
export const ALTURA_DO_MAIS = 17;
/** Borda de cima (1) + `p-1.5` em cima e embaixo (12) + número do dia (24) e `mb-1` (4). */
export const ALTURA_DO_CABECALHO = 41;
/** Antes de medir (primeira pintura): o mínimo que cabe numa tela comum. */
export const ETIQUETAS_SEM_MEDIDA = 2;

/**
 * Quantas das `total` etiquetas do dia mostrar, numa célula de `altura` px.
 * Sem medida (`null`), mostra até `ETIQUETAS_SEM_MEDIDA`. O resto vira "+N mais".
 */
export function etiquetasQueCabem(altura: number | null, total: number): number {
  if (altura === null) return Math.min(total, ETIQUETAS_SEM_MEDIDA);
  const util = altura - ALTURA_DO_CABECALHO;
  const passo = ALTURA_DA_ETIQUETA + VAO_ENTRE_ETIQUETAS;
  const cabem = Math.max(0, Math.floor((util + VAO_ENTRE_ETIQUETAS) / passo));
  if (total <= cabem) return total;
  // Não cabem todas: a última linha é do "+N mais".
  return Math.max(0, Math.floor((util - ALTURA_DO_MAIS) / passo));
}
