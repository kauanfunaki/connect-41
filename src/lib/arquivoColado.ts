/**
 * O que fazer com um Ctrl+V numa tela que aceita arquivos (05/11/2026).
 *
 * Só vira anexo a colagem que traz arquivo e nenhum texto: copiar um trecho do
 * Word ou de uma página leva texto junto (e às vezes uma imagem do trecho), e
 * isso é para o campo onde se está digitando, não para os anexos. É a mesma
 * regra da caixa de mensagem dos chamados.
 */
export function arquivosDaColagem(arquivos: File[], texto: string): File[] {
  return arquivos.length && !texto ? arquivos : [];
}

/**
 * Print colado chega como "image.png", todos com o mesmo nome. Ganha a data e
 * a hora da colagem ("print 05-11-2026 14h32.png"); do segundo print colado
 * na tela em diante, o número ("… 14h32 (2).png"). Arquivo com nome de verdade
 * (copiado do Explorer) fica como veio.
 */
export function nomeDoArquivoColado(nome: string, quando: Date, ordem = 1): string {
  const generico = /^image\.([a-z0-9]+)$/i.exec(nome);
  if (!generico) return nome;
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `print ${p(quando.getDate())}-${p(quando.getMonth() + 1)}-${quando.getFullYear()} ${p(quando.getHours())}h${p(quando.getMinutes())}`;
  return `${base}${ordem > 1 ? ` (${ordem})` : ""}.${generico[1].toLowerCase()}`;
}
