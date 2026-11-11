// A notificação nova vira aviso no canto da tela (09/11/2026) — a regra, sem
// banco, para o sino (cliente) e a rota que ele consulta.
//
// Até aqui o sino só conferia o número a cada minuto e não mostrava nada: a
// pessoa só sabia que chegou aviso se olhasse o número vermelho. Agora o que
// chega com a página aberta aparece no canto inferior direito, e o clique leva
// à tela do aviso. O que já existia ao abrir a página não vira aviso, e o mesmo
// aviso não aparece duas vezes (nem em duas abas).
//
// Revisto em 10/11/2026: quem voltava ao Connect depois de um tempo fora (ou
// de outra aba) achava uma pilha de avisos no canto. Agora cada conferência
// põe UM aviso, ou nenhum (ver `avisoDoCanto`): a notificação, quando chegou
// uma só; o resumo "N avisos novos", quando chegou mais de uma, e o clique
// abre o sino. A aba em segundo plano não põe nada no canto — ninguém veria —
// e o que chegou fica para a conferência de quando a pessoa voltar.

import type { IconeDaNotificacao, Tom } from "./catalogo";
import type { TipoDoChip } from "./consultas";

/** Avisos no computador por conferência (o som é um só): os das mais novas. */
export const MAXIMO_DE_AVISOS = 3;
/**
 * Quantas novas a rota devolve por conferência, as mais novas. Além disso vem
 * só a contagem (`total`): o resumo diz quantas são sem trazer todas.
 */
export const JANELA_DA_CONFERENCIA = 20;
/** Quantos tipos o resumo nomeia; os demais viram "e outros". */
export const TIPOS_NO_RESUMO = 3;
/** O grupo dos avisos do sino no `Toast`: no máximo dois juntos, o terceiro tira o mais antigo. */
export const GRUPO_DAS_NOTIFICACOES = "notificacoes";
/** Quantos ids já mostrados a aba guarda (entre abas, no navegador). */
export const MOSTRADOS_GUARDADOS = 50;

/**
 * A notificação que chegou, com o que o aviso do canto desenha (10/11/2026):
 * o mesmo conteúdo do cartão do sino — ícone e tom do catálogo, título, frase,
 * quem fez, a origem (chip) e a hora.
 */
export type NotificacaoNova = {
  id: string;
  tipo: string;
  icone: IconeDaNotificacao;
  tom: Tom;
  titulo: string;
  mensagem: string;
  href: string | null;
  lida: boolean;
  /** ISO. */
  criadaEm: string;
  chip: { rotulo: string; tipo: TipoDoChip } | null;
  autor: { nome: string; foto: string | null } | null;
};

/**
 * O que a rota `/api/notificacoes/novas` devolve. `cursor` é o `desde` da
 * próxima conferência: na primeira (sem `desde`), a notificação mais nova que a
 * pessoa já tem — tudo até ali "já existia ao abrir a página".
 *
 * `novas` traz só as `JANELA_DA_CONFERENCIA` mais novas; `total` diz quantas
 * não lidas chegaram depois do `desde`, contando as que ficaram fora da lista.
 */
export type RespostaDasNovas = { naoLidas: number; novas: NotificacaoNova[]; total: number; cursor: string };

/** O `desde` que chega na rota: um instante válido, ou nada (a primeira conferência). */
export function lerDesde(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** O próximo `desde`: a mais nova que chegou, sem nunca andar para trás. */
export function cursorDepois(desde: string, novas: readonly { criadaEm: string }[]): string {
  let maior = new Date(desde).getTime();
  for (const n of novas) maior = Math.max(maior, new Date(n.criadaEm).getTime());
  return new Date(maior).toISOString();
}

const instante = (n: { criadaEm: string }) => new Date(n.criadaEm).getTime();

/**
 * As não lidas que ainda não estão em `ja`, sem repetir, na ordem em que
 * chegaram. O tipo oculto nas preferências nem chega aqui: a rota tira.
 */
function ineditas(novas: readonly NotificacaoNova[], ja: ReadonlySet<string>): NotificacaoNova[] {
  const vistos = new Set<string>();
  return novas
    .filter((n) => {
      if (n.lida || ja.has(n.id) || vistos.has(n.id)) return false;
      vistos.add(n.id);
      return true;
    })
    .sort((a, b) => instante(a) - instante(b));
}

/**
 * O som e o aviso no computador da conferência: as não lidas que nenhuma aba
 * anunciou ainda. Todas passam a contar como anunciadas — a aba em segundo
 * plano confere de novo a mesma lista, e não pode tocar duas vezes pela mesma
 * —, mas o aviso no computador sai só para as 3 mais novas, na ordem em que
 * chegaram.
 */
export function anuncioDaConferencia(
  novas: readonly NotificacaoNova[],
  anunciados: ReadonlySet<string>,
  maximo = MAXIMO_DE_AVISOS
): { anunciar: NotificacaoNova[]; anunciadas: string[] } {
  const todas = ineditas(novas, anunciados);
  return { anunciar: todas.slice(Math.max(0, todas.length - maximo)), anunciadas: todas.map((n) => n.id) };
}

/** O aviso que a conferência põe no canto da tela: um só, nunca uma pilha. */
export type AvisoDoCanto =
  /** Chegou uma só: o aviso dela, clicável, que leva à tela e marca como lida. */
  | { tipo: "uma"; notificacao: NotificacaoNova }
  /**
   * Chegou mais de uma: o resumo, e o clique abre o sino. `tipos`: os títulos
   * das que vieram na lista, sem repetir, o mais novo primeiro; `foraDaLista`:
   * as contadas além da lista, de tipo desconhecido.
   */
  | { tipo: "resumo"; quantas: number; tipos: string[]; foraDaLista: number };

/**
 * O que a conferência põe no canto — um aviso só, ou nada — e os ids que
 * passam a contar como mostrados (entre as abas):
 * - conta as não lidas que ainda não apareceram no canto, nesta aba ou em outra;
 * - uma → o aviso dela; mais de uma → o resumo "N avisos novos";
 * - as que ficaram fora da lista (`total` maior que `novas`) entram na conta
 *   só quando a mais antiga da lista também é inédita: o canto mostra em ordem
 *   de chegada, então, se ela já apareceu, as de antes dela também.
 */
export function avisoDoCanto(
  resposta: Pick<RespostaDasNovas, "novas" | "total">,
  mostrados: ReadonlySet<string>
): { aviso: AvisoDoCanto | null; mostradas: string[] } {
  const todas = ineditas(resposta.novas, mostrados);
  if (todas.length === 0) return { aviso: null, mostradas: [] };
  const inicioDaLista = Math.min(...resposta.novas.map(instante));
  const foraDaLista = instante(todas[0]) === inicioDaLista ? Math.max(0, resposta.total - resposta.novas.length) : 0;
  const quantas = todas.length + foraDaLista;
  const mostradas = todas.map((n) => n.id);
  if (quantas === 1) return { aviso: { tipo: "uma", notificacao: todas[0] }, mostradas };
  const tipos = [...new Set(todas.map((n) => n.titulo).reverse())];
  return { aviso: { tipo: "resumo", quantas, tipos, foraDaLista }, mostradas };
}

/**
 * O texto do resumo: "3 avisos novos" no título e, embaixo, os tipos que
 * chegaram, o mais novo primeiro — "Nova solicitação, Certidão positiva e
 * outros" —, para a pessoa saber se vale abrir agora.
 */
export function textoDoResumo(r: { quantas: number; tipos: readonly string[]; foraDaLista: number }): { titulo: string; mensagem: string } {
  const nomeados = r.tipos.slice(0, TIPOS_NO_RESUMO);
  const partes = r.tipos.length > nomeados.length || r.foraDaLista > 0 ? [...nomeados, "outros"] : nomeados;
  const ultima = partes[partes.length - 1] ?? "";
  const s = r.quantas === 1 ? "" : "s";
  return {
    titulo: `${r.quantas} aviso${s} novo${s}`,
    mensagem: partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${ultima}` : ultima,
  };
}

/** Para onde o clique leva: só um caminho do próprio Connect ("/..."); o resto não vira link. */
export function destinoDoClique(n: { href: string | null }): string | null {
  const h = n.href;
  if (!h || !h.startsWith("/") || h.startsWith("//") || h.startsWith("/\\")) return null;
  return h;
}

/** Os ids mostrados, os mais recentes no fim, sem repetir e com teto. */
export function lembrarMostrados(anteriores: readonly string[], novos: readonly string[], maximo = MOSTRADOS_GUARDADOS): string[] {
  const novosSet = new Set(novos);
  return [...anteriores.filter((id) => !novosSet.has(id)), ...novos].slice(-maximo);
}
