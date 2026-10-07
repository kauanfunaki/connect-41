// Texto corrido com os endereços da web separados, para virarem link na tela.
//
// Nasceu para as observações do processo (07/10/2026): a importação do Trello
// abre o texto com o endereço do cartão e manda "abrir o cartão para baixar" os
// anexos — e o endereço saía como texto puro, sem clique. O `SimpleMarkdown`
// não faz isso, e o texto não é Markdown: é o que a equipe e o Trello
// escreveram, com quebras de linha que precisam ficar.
//
// Só `http://` e `https://`: o texto vem de fora (Trello, comentário de gente),
// e um `javascript:` virando link seria uma porta aberta.

export type ParteDoTexto = { tipo: "texto"; texto: string } | { tipo: "link"; url: string };

const ENDERECO = /https?:\/\/[^\s<>"'`]+/g;

/** Pontuação colada no fim do endereço é da frase, não do link ("…/c/abc."). */
const PONTUACAO_FINAL = /[.,;:!?)\]}]+$/;

export function partesComLinks(texto: string): ParteDoTexto[] {
  const partes: ParteDoTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(ENDERECO)) {
    const inicio = m.index ?? 0;
    const sobra = m[0].match(PONTUACAO_FINAL)?.[0] ?? "";
    const url = sobra ? m[0].slice(0, -sobra.length) : m[0];
    // "https://" sozinho não leva a lugar nenhum.
    if (url.length <= "https://".length) continue;
    if (inicio > ultimo) partes.push({ tipo: "texto", texto: texto.slice(ultimo, inicio) });
    partes.push({ tipo: "link", url });
    ultimo = inicio + url.length;
  }
  if (ultimo < texto.length) partes.push({ tipo: "texto", texto: texto.slice(ultimo) });
  return partes;
}
