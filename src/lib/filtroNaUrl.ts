// Leitura dos filtros que chegam pela URL — o funil das tabelas paginadas
// (`FiltroDaColunaNaUrl`) escreve a escolha como parâmetro repetido
// (`?regime=A&regime=B`). Morava na lib da listagem de empresas e era importado
// de lá por Candidatos, Testes e Vagas (02/10/2026).

/** `?x=a&x=b` chega como array; `?x=a` como string; ausente como undefined. */
export function lerLista(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
