// O arrastar dos blocos do editor (06/11/2026), a conta sem DOM.
//
// O arrastar nativo do HTML5 (`draggable` + `drop`) não respondia: o puxador
// cancela o `mousedown` para não tirar o foco do texto, o que impede o
// navegador de começar o arraste, e o `drop` disputava o evento com o próprio
// ProseMirror. Agora o arraste é por eventos de ponteiro (mouse e toque): o
// componente mede os blocos e esta conta diz onde o bloco cai.

/** Quanto o ponteiro anda antes de virar arraste — abaixo disso, é clique (abre o menu). */
export const LIMIAR_DO_ARRASTE = 4;

export function virouArraste(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= LIMIAR_DO_ARRASTE;
}

/** Topo e altura de cada bloco de nível 1, na ordem do documento. */
export type CaixaDoBloco = { top: number; height: number };

/**
 * Onde o bloco entra, como índice de inserção (0 = antes do primeiro, n =
 * depois do último): antes do primeiro bloco cuja metade fica abaixo do
 * ponteiro.
 */
export function indiceDeInsercao(blocos: readonly CaixaDoBloco[], y: number): number {
  const i = blocos.findIndex((b) => y < b.top + b.height / 2);
  return i === -1 ? blocos.length : i;
}

/** A linha que mostra onde o bloco vai cair: o topo do bloco de destino, ou o pé do último. */
export function alturaDaLinha(blocos: readonly CaixaDoBloco[], insercao: number): number | null {
  if (blocos.length === 0) return null;
  if (insercao < blocos.length) return blocos[insercao].top;
  const ultimo = blocos[blocos.length - 1];
  return ultimo.top + ultimo.height;
}

/**
 * Do índice de inserção para o `para` do mover (índice final do bloco).
 * Soltar logo antes ou logo depois de si mesmo não move: `null`.
 */
export function destinoDoBloco(de: number, insercao: number): number | null {
  if (insercao === de || insercao === de + 1) return null;
  return insercao > de ? insercao - 1 : insercao;
}
