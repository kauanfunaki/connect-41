// A forma de uma resposta do Omie, para a prévia (Fase 1a da integração).
//
// Antes de gravar nota do Omie no acervo, é preciso ver o que a API devolve de
// verdade — nome da lista, dos campos, formato de data e de valor. A
// documentação cobre o essencial, mas o primeiro adaptador escrito só por ela
// é o que quebra em silêncio. Esta função resume uma resposta em "caminho →
// tipo e exemplo", com os textos cortados, para a tela de diagnóstico.

export type LinhaDaEstrutura = { caminho: string; tipo: string; exemplo: string };

const MAX_LINHAS = 200;

export function estruturaDe(valor: unknown, caminho = "", saida: LinhaDaEstrutura[] = []): LinhaDaEstrutura[] {
  if (saida.length >= MAX_LINHAS) return saida;
  if (Array.isArray(valor)) {
    saida.push({ caminho: caminho || "(raiz)", tipo: `lista[${valor.length}]`, exemplo: "" });
    // O primeiro item basta para ver a forma; os outros repetiriam.
    if (valor.length > 0) estruturaDe(valor[0], `${caminho}[0]`, saida);
    return saida;
  }
  if (valor !== null && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      estruturaDe(v, caminho ? `${caminho}.${k}` : k, saida);
      if (saida.length >= MAX_LINHAS) break;
    }
    return saida;
  }
  const tipo = valor === null ? "null" : typeof valor;
  const texto = valor === null || valor === undefined ? "" : String(valor);
  saida.push({ caminho, tipo, exemplo: texto.length > 60 ? `${texto.slice(0, 57)}…` : texto });
  return saida;
}
