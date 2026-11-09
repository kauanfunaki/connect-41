// A notificação nova vira aviso no canto da tela (09/11/2026) — a regra, sem
// banco, para o sino (cliente) e a rota que ele consulta.
//
// Até aqui o sino só conferia o número a cada minuto e não mostrava nada: a
// pessoa só sabia que chegou aviso se olhasse o número vermelho. Agora o que
// chega com a página aberta aparece no canto inferior direito, e o clique leva
// à tela do aviso. O que já existia ao abrir a página não vira aviso, o mesmo
// aviso não aparece duas vezes (nem em duas abas), e no máximo 3 de uma vez.

/** Notificações novas na tela ao mesmo tempo, e quantas a rota devolve por conferência. */
export const MAXIMO_DE_AVISOS = 3;
/** O grupo dos avisos do sino no `Toast`: o quarto que chega tira o mais antigo. */
export const GRUPO_DAS_NOTIFICACOES = "notificacoes";
/** Quantos ids já mostrados a aba guarda (entre abas, no navegador). */
export const MOSTRADOS_GUARDADOS = 50;

export type NotificacaoNova = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  href: string | null;
  lida: boolean;
  /** ISO. */
  criadaEm: string;
};

/**
 * O que a rota `/api/notificacoes/novas` devolve. `cursor` é o `desde` da
 * próxima conferência: na primeira (sem `desde`), a notificação mais nova que a
 * pessoa já tem — tudo até ali "já existia ao abrir a página".
 */
export type RespostaDasNovas = { naoLidas: number; novas: NotificacaoNova[]; cursor: string };

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

/**
 * Quais viram aviso: as não lidas que esta pessoa ainda não viu em aviso, as
 * 3 mais novas, na ordem em que chegaram (a mais nova fica embaixo, mais
 * perto do olho). O tipo oculto nas preferências nem chega aqui: a rota tira.
 */
export function avisosParaMostrar(novas: readonly NotificacaoNova[], mostrados: ReadonlySet<string>, maximo = MAXIMO_DE_AVISOS): NotificacaoNova[] {
  const vistos = new Set<string>();
  const candidatas = novas.filter((n) => {
    if (n.lida || mostrados.has(n.id) || vistos.has(n.id)) return false;
    vistos.add(n.id);
    return true;
  });
  return candidatas
    .sort((a, b) => new Date(a.criadaEm).getTime() - new Date(b.criadaEm).getTime())
    .slice(-maximo);
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
