/**
 * Quando a caixa de resposta do chamado abre e recolhe (05/11/2026, opção A da
 * tela do chamado). Começa recolhida, numa linha "Escrever uma resposta…", para
 * a conversa aparecer inteira.
 *
 * - focar a linha, clicar no clipe ou colar um arquivo nela: abre;
 * - Esc: recolhe só com a caixa vazia (sem texto e sem arquivo) — com rascunho,
 *   o Esc não engole o que a pessoa escreveu;
 * - "Recolher": recolhe sempre, e o rascunho fica (texto e arquivos);
 * - enviado: recolhe, já vazia.
 */
export type EventoDaCaixa = "focar" | "anexar" | "colar-arquivo" | "esc" | "recolher" | "enviado";
export type Rascunho = { texto: string; arquivos: number };

export const vazia = (r: Rascunho) => !r.texto.trim() && r.arquivos === 0;

export function caixaAberta(aberta: boolean, evento: EventoDaCaixa, rascunho: Rascunho): boolean {
  switch (evento) {
    case "focar": case "anexar": case "colar-arquivo": return true;
    case "esc": return vazia(rascunho) ? false : aberta;
    case "recolher": case "enviado": return false;
  }
}

/** O lembrete na linha recolhida quando há rascunho: "Rascunho com 2 arquivos". */
export function resumoDoRascunho(r: Rascunho): string {
  if (vazia(r)) return "";
  if (!r.arquivos) return "Rascunho";
  return `Rascunho com ${r.arquivos === 1 ? "1 arquivo" : `${r.arquivos} arquivos`}`;
}
