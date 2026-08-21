// Setor ativo — o "subworkspace" em que a pessoa está.
//
// A ideia: o setor já é cidadão de primeira classe no Connect (tabela `sectors`,
// `UserSector`, `sectorCode` no catálogo de módulos, `SectorTaskView`). O que
// faltava era o shell saber em qual deles o usuário está *agora*, para que quem
// é só do BPO veja uma interface de BPO em vez de onze setores.
//
// REGRA DE OURO: setor ativo é FILTRO DE VISÃO PADRÃO, nunca muro de permissão.
// A permissão continua sendo UserSector ∩ RBAC (canViewSector/canActOnSector em
// context.ts). Quem tem acesso a dois setores nunca deve receber "sem permissão"
// por causa do seletor — só ver menos por padrão. Por isso este módulo só
// devolve escopo de leitura, e nada aqui é consultado para autorizar escrita.
//
// De onde vem o candidato, em ordem de precedência (ver resolveSectorHint):
//   1. subdomínio do host — bpo.useconnect.com.br
//   2. cookie de preferência — memória do último setor usado
//
// A URL ganha do cookie de propósito: link compartilhado tem que abrir no setor
// certo, e não no último que o destinatário usou.

// Hosts que NÃO são setor, mesmo aparecendo como subdomínio do domínio-base.
// `app` é o endereço neutro (seletor de setor); `www` é óbvio.
const HOSTS_RESERVADOS = new Set(["app", "www"]);

// O domínio-base precisa ser CONFIGURAÇÃO, não palpite. Contar rótulos não
// funciona: `useconnect.com.br` tem três e nenhum subdomínio, enquanto
// `bpo.useconnect.com.br` tem quatro e um. Sem APP_DOMAIN definido, o host
// nunca vira setor e sobra só o cookie — que é o comportamento certo em
// desenvolvimento e o único seguro num deploy mal configurado.
function baseDomain(): string | null {
  const bruto = process.env.NEXT_PUBLIC_APP_DOMAIN?.trim().toLowerCase();
  return bruto ? bruto.replace(/^\.+/, "") : null;
}

// Código de setor tem o mesmo formato em `sectors.code` (VarChar(40)).
const FORMATO_CODIGO = /^[a-z0-9_-]{1,40}$/;

export const COOKIE_SETOR_ATIVO = "active_sector_code";
export const HEADER_SETOR_ATIVO = "x-active-sector";

/**
 * Extrai o candidato a setor do host e do cookie, sem validar permissão.
 * Roda no proxy, onde não há acesso a banco — quem decide se o usuário pode
 * de fato estar naquele setor é `resolveActiveSector`.
 */
export function resolveSectorHint(
  host: string | null,
  cookieValue: string | null,
  dominioBase: string | null = baseDomain(),
): string | null {
  const doHost = sectorFromHost(host, dominioBase);
  if (doHost) return doHost;
  return normalizeCode(cookieValue);
}

function sectorFromHost(host: string | null, dominioBase: string | null): string | null {
  if (!host || !dominioBase) return null;
  // Fora a porta, e case-insensitive — `Host` chega como o cliente mandou.
  const semPorta = host.split(":")[0]!.toLowerCase();
  const sufixo = `.${dominioBase}`;
  if (!semPorta.endsWith(sufixo)) return null;

  const prefixo = semPorta.slice(0, -sufixo.length);
  // Só um nível: `bpo.useconnect.com.br` vale, `a.b.useconnect.com.br` não —
  // subdomínio aninhado não é endereço que a gente emite.
  if (!prefixo || prefixo.includes(".")) return null;
  if (HOSTS_RESERVADOS.has(prefixo)) return null;
  return normalizeCode(prefixo);
}

function normalizeCode(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase();
  return FORMATO_CODIGO.test(limpo) ? limpo : null;
}

export type ResolveActiveSectorInput = {
  /** Candidato vindo do host ou do cookie. */
  hint: string | null;
  /** Setores do usuário (UserSector). Vazio para admin sem setor atribuído. */
  userSectors: string[];
  /** SUPER_ADMIN / ADMIN / READONLY — enxergam o tenant inteiro. */
  isFullAccess: boolean;
};

/**
 * Decide o setor ativo. `null` significa "Todos os setores" — que é sempre a
 * união do que a pessoa já pode ver, nunca mais que isso.
 *
 * Três casos, nesta ordem:
 *   1. Quem pertence a UM setor e não é full access fica sempre nele. Não há
 *      escolha a oferecer, então também não há seletor a mostrar.
 *   2. Candidato válido e permitido vence.
 *   3. Sem candidato (ou candidato não permitido) cai em "Todos".
 *
 * Candidato não permitido cai em "Todos" em vez de erro **de propósito**: um
 * link de outro setor deve levar a pessoa ao lugar mais próximo que ela pode
 * ver, não a uma tela de acesso negado — o setor ativo não é permissão.
 */
export function resolveActiveSector({
  hint,
  userSectors,
  isFullAccess,
}: ResolveActiveSectorInput): string | null {
  if (!isFullAccess && userSectors.length === 1) return userSectors[0]!;

  const candidato = normalizeCode(hint);
  if (!candidato) return null;
  if (isFullAccess || userSectors.includes(candidato)) return candidato;
  return null;
}

/**
 * Os códigos de setor que devem filtrar uma consulta.
 *
 * `null` significa SEM FILTRO — só acontece para quem é full access e está em
 * "Todos os setores". Para os demais, "Todos" é a lista dos setores da pessoa,
 * que é exatamente o comportamento que o app já tinha antes do setor ativo
 * existir.
 */
export function sectorScope(
  activeSector: string | null,
  userSectors: string[],
  isFullAccess: boolean,
): string[] | null {
  if (activeSector) return [activeSector];
  if (isFullAccess) return null;
  return userSectors;
}

/**
 * Se o seletor de setor deve aparecer. Com uma opção só não há o que escolher —
 * o controle vira rótulo, que é o caso da maioria dos usuários e o que torna a
 * mudança indolor para quem compra o Connect com um setor só.
 */
export function shouldShowSectorSwitcher(
  availableSectors: string[],
  isFullAccess: boolean,
): boolean {
  if (isFullAccess) return availableSectors.length > 1;
  // Não-full-access com N setores ganha as N opções + "Todos".
  return availableSectors.length > 1;
}
