// A fila dos avisos do canto (`Toast`), sem React (09/11/2026): quanto cada um
// fica e quantos do mesmo grupo cabem juntos. Separada para o teste segurar a
// regra sem montar o provedor.

export type TipoDoAviso = "success" | "error" | "info";

/** Quanto cada aviso fica: o de erro o dobro — é o que a pessoa precisa ler e agir. */
export const DURACAO_DO_AVISO: Record<TipoDoAviso, number> = { success: 5000, info: 5000, error: 10000 };

/** O aviso que leva a algum lugar fica mais: dá tempo de ler e decidir clicar. */
export const DURACAO_DO_CLICAVEL = 9000;

/**
 * Avisos do mesmo grupo (as notificações novas, por exemplo) na tela ao mesmo
 * tempo. Eram 3 até 10/11/2026: com o resumo "N avisos novos", cada conferência
 * do sino põe um só, e dois juntos já é o caso raro (dois push em seguida).
 */
export const MAXIMO_POR_GRUPO = 2;

export function duracaoDoAviso(tipo: TipoDoAviso, clicavel: boolean): number {
  return clicavel ? Math.max(DURACAO_DO_AVISO[tipo], DURACAO_DO_CLICAVEL) : DURACAO_DO_AVISO[tipo];
}

/**
 * Põe o aviso novo no fim da fila. Com grupo, o mais antigo do mesmo grupo sai
 * quando passaria do máximo — o novo sempre entra, e os sem grupo não mudam.
 */
export function entrarNaFila<T extends { id: number; grupo?: string }>(fila: readonly T[], novo: T, maximo = MAXIMO_POR_GRUPO): T[] {
  if (!novo.grupo) return [...fila, novo];
  const doGrupo = fila.filter((a) => a.grupo === novo.grupo);
  const saem = new Set(doGrupo.slice(0, Math.max(0, doGrupo.length - (maximo - 1))).map((a) => a.id));
  return [...fila.filter((a) => !saem.has(a.id)), novo];
}
