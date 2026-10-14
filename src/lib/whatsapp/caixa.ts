// A caixa do WhatsApp do Recrutamento no navegador (14/10/2026): o que a lista
// da esquerda e o painel da direita decidem juntos, sem ir ao servidor.
//
// Pedido do Kauan: trocar de conversa não pode recarregar a tela. A lista mora
// no layout de /whatsapp (não remonta ao abrir outra conversa), e o recorte
// (`?ver=`), a busca e o ↑↓ do painel passaram a ser calculados aqui, no
// navegador, a partir da mesma lista — o servidor só entrega as conversas.

import { filtrarConversas, recorteDaUrl, type ConversaParaTela, type RecorteDaLista } from "@/lib/whatsapp/conversas";

export { recorteDaUrl };

export const RECORTES: { chave: RecorteDaLista; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "sem_responsavel", rotulo: "Sem responsável" },
  { chave: "minhas", rotulo: "Minhas" },
];

/** O que a busca olha em cada conversa. */
type Buscavel = { nome: string | null; vaga: string | null; waPhone: string };

/**
 * A busca da lista: nome ou vaga por trecho, sem diferença de maiúscula; o
 * telefone pelos dígitos, a partir de três (menos que isso casa com quase
 * todo número e não ajuda).
 */
export function buscarConversas<T extends Buscavel>(conversas: T[], busca: string): T[] {
  const t = busca.trim().toLowerCase();
  if (!t) return conversas;
  const digitos = t.replace(/\D/g, "");
  return conversas.filter(
    (c) =>
      (c.nome ?? "").toLowerCase().includes(t) ||
      (c.vaga ?? "").toLowerCase().includes(t) ||
      (digitos.length >= 3 && c.waPhone.includes(digitos))
  );
}

type ComResponsavel = ConversaParaTela & { responsavel: { id: string } | null };

/** O número de cada aba ("Todas 16 · Sem responsável 3 · Minhas 2"). */
export function contarRecortes(conversas: ComResponsavel[], userId: string): Record<RecorteDaLista, number> {
  return {
    todas: conversas.length,
    sem_responsavel: filtrarConversas(conversas, "sem_responsavel", userId).length,
    minhas: filtrarConversas(conversas, "minhas", userId).length,
  };
}

/** O recorte na URL: "Todas" é o padrão e não aparece. */
export function sufixoDoRecorte(recorte: RecorteDaLista): string {
  return recorte === "todas" ? "" : `?ver=${recorte}`;
}

/** O endereço de uma conversa, levando o recorte junto (F5 e link direto abrem igual). */
export function hrefDaConversa(id: string, recorte: RecorteDaLista): string {
  return `/whatsapp/${encodeURIComponent(id)}${sufixoDoRecorte(recorte)}`;
}

/** O endereço da tela com outro recorte, na conversa que estiver aberta (ou na lista). */
export function hrefDoRecorte(abertaId: string | null, recorte: RecorteDaLista): string {
  return abertaId ? hrefDaConversa(abertaId, recorte) : `/whatsapp${sufixoDoRecorte(recorte)}`;
}

export type NavegacaoDoPainel = { fechar: string; anterior: string | null; proxima: string | null };

/**
 * Fechar, a anterior e a próxima do painel (o ✕ e o ↑↓), pela lista que está
 * à esquerda agora — o recorte e a busca. A conversa aberta que a busca
 * escondeu não tem vizinhas: o ↓ leva à primeira da lista, e o ↑ fica parado.
 */
export function navegacaoDoPainel(visiveis: { id: string }[], abertaId: string, recorte: RecorteDaLista): NavegacaoDoPainel {
  const fechar = `/whatsapp${sufixoDoRecorte(recorte)}`;
  const i = visiveis.findIndex((c) => c.id === abertaId);
  if (i < 0) {
    const primeira = visiveis[0];
    return { fechar, anterior: null, proxima: primeira ? hrefDaConversa(primeira.id, recorte) : null };
  }
  const anterior = visiveis[i - 1];
  const proxima = visiveis[i + 1];
  return {
    fechar,
    anterior: anterior ? hrefDaConversa(anterior.id, recorte) : null,
    proxima: proxima ? hrefDaConversa(proxima.id, recorte) : null,
  };
}

/**
 * De quanto em quanto tempo a tela busca o que chegou. Antes, cada conversa
 * aberta recarregava a tela inteira, e a lista vinha nova de carona; com a
 * lista parada no layout, sem isto a mensagem nova de um candidato só
 * apareceria depois de alguma ação ou de um F5.
 */
export const ATUALIZAR_A_CADA_MS = 30_000;

/** Hora de buscar de novo: com a aba à vista e passado o intervalo desde a última vez. */
export function horaDeAtualizar(ultimaEm: number, agora: number, visivel: boolean, intervaloMs = ATUALIZAR_A_CADA_MS): boolean {
  return visivel && agora - ultimaEm >= intervaloMs;
}
