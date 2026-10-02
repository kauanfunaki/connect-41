// Qual artigo explica a tela aberta — leve de propósito: roda no navegador (o
// "?" do topo) com só os pares caminho → chave, sem o texto dos artigos.

export type ParDeCaminho = { caminho: string; chave: string };

/**
 * O artigo da tela: o caminho mais específico que casa por segmento inteiro —
 * `/dre/economica` ganha de `/dre`, e `/processos` não casa com `/processosx`.
 */
export function chaveDoCaminho(pathname: string, pares: readonly ParDeCaminho[]): string | null {
  let melhor: ParDeCaminho | null = null;
  for (const p of pares) {
    const casa = pathname === p.caminho || pathname.startsWith(`${p.caminho.replace(/\/$/, "")}/`);
    if (casa && (!melhor || p.caminho.length > melhor.caminho.length)) melhor = p;
  }
  return melhor?.chave ?? null;
}
