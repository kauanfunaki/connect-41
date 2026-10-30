"use client";

/**
 * Quem fecha no Esc: só a camada de cima.
 *
 * Diálogos (`useDialog`), painéis flutuantes (`PainelFlutuante`, logo `Popover`
 * e o calendário dos campos de data) e o `Dropdown` se empilham aqui enquanto
 * estão abertos, e um único ouvinte no `document` fecha o topo da pilha.
 *
 * Antes cada um tinha o próprio ouvinte, e todos rodavam na ordem em que foram
 * registrados — o do diálogo, aberto primeiro, antes do painel aberto dentro
 * dele. Esc para fechar o calendário de um campo dentro de uma janela fechava
 * a janela inteira e o que já estava digitado se perdia (auditoria de UX,
 * 30/10/2026).
 *
 * O ouvinte entra depois do do React (que o Next liga no `document` ao
 * hidratar), então um `onKeyDown` de componente roda antes: quem trata o Esc
 * sozinho — a lista aberta de um combobox, um editor — chama
 * `preventDefault()` e a pilha não fecha nada.
 */

type Camada = { fechar: () => void };

const pilha: Camada[] = [];

function aoTeclar(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const topo = pilha[pilha.length - 1];
  if (!topo) return;
  // Marca o Esc como usado: o chat de IA, que escuta na janela, não fecha junto.
  e.preventDefault();
  topo.fechar();
}

/** Põe uma camada no topo; devolve a função que a tira (para o cleanup do efeito). */
export function empilharCamada(fechar: () => void): () => void {
  const camada: Camada = { fechar };
  if (pilha.length === 0) document.addEventListener("keydown", aoTeclar);
  pilha.push(camada);
  return () => {
    const i = pilha.indexOf(camada);
    if (i >= 0) pilha.splice(i, 1);
    if (pilha.length === 0) document.removeEventListener("keydown", aoTeclar);
  };
}
