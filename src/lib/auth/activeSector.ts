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
// Lido em RUNTIME, no servidor. Já foi `NEXT_PUBLIC_APP_DOMAIN` e voltou atrás:
// variável `NEXT_PUBLIC_` é gravada no bundle do cliente na hora do BUILD, e o
// nosso Dockerfile roda `npm run build` sem recebê-la — o seletor no navegador
// ficaria com `undefined` mesmo com a variável definida no ambiente. Quem
// precisa do valor no cliente recebe por prop, do layout (Server Component).
export function baseDomain(): string | null {
  const bruto = process.env.APP_DOMAIN?.trim().toLowerCase();
  return bruto ? bruto.replace(/^\.+/, "") : null;
}

// Sufixo no subdomínio, para conviver com endereços já ocupados.
//
// Decisão de 2026-08-21: `bpo.`, `societario.` e `dre.` continuam apontando
// para os protótipos do Marcos, então o Connect usa `bpoteste.`,
// `societarioteste.` etc. Com SECTOR_HOST_SUFFIX="teste", o host `bpoteste`
// resolve para o setor `bpo` — sem que o código do setor no banco precise
// mudar.
//
// É temporário por natureza: quando os protótipos saírem do ar, basta apagar a
// variável e `bpo.` volta a valer, sem tocar em código.
export function hostSuffix(): string {
  return process.env.SECTOR_HOST_SUFFIX?.trim().toLowerCase() ?? "";
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
  sufixoSetor: string = hostSuffix(),
): string | null {
  const doHost = sectorFromHost(host, dominioBase, sufixoSetor);
  if (doHost) return doHost;
  return normalizeCode(cookieValue);
}

function sectorFromHost(
  host: string | null,
  dominioBase: string | null,
  sufixoSetor: string,
): string | null {
  if (!host || !dominioBase) return null;
  // Fora a porta, e case-insensitive — `Host` chega como o cliente mandou.
  const semPorta = host.split(":")[0]!.toLowerCase();
  const sufixoDominio = `.${dominioBase}`;
  if (!semPorta.endsWith(sufixoDominio)) return null;

  let prefixo = semPorta.slice(0, -sufixoDominio.length);
  // Só um nível: `bpo.useconnect.com.br` vale, `a.b.useconnect.com.br` não —
  // subdomínio aninhado não é endereço que a gente emite.
  if (!prefixo || prefixo.includes(".")) return null;

  if (sufixoSetor) {
    // Sem o sufixo, o host não é endereço de setor: com SUFFIX="teste",
    // `bpoteste` vale e `bpo` (que é o protótipo) não.
    if (!prefixo.endsWith(sufixoSetor)) return null;
    prefixo = prefixo.slice(0, -sufixoSetor.length);
  }

  // Reservado é conferido DEPOIS de tirar o sufixo: `appteste` é o endereço
  // neutro com sufixo, e não um setor chamado "app".
  if (!prefixo || HOSTS_RESERVADOS.has(prefixo)) return null;
  return normalizeCode(prefixo);
}

/** Host de um setor, ou do endereço neutro quando `code` é null. */
export function sectorHost(code: string | null, dominioBase: string | null, sufixoSetor: string): string | null {
  if (!dominioBase) return null;
  return `${code ?? "app"}${sufixoSetor}.${dominioBase}`;
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
