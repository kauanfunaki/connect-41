// A empresa escolhida no portal (11/11/2026, polimento do portal, P12).
//
// Quem tem mais de uma empresa escolhia uma no Início e, no primeiro clique do
// menu, a tela seguinte voltava a "todas" — a escolha só vivia na URL, e o menu
// não a leva. Agora a escolha fica num cookie do portal (`path=/portal`), que o
// seletor grava a cada troca e as telas leem quando a URL não traz empresa.
//
// O cookie é só a lembrança, nunca a autorização: o que vem dele (ou da URL)
// só vale se for uma das empresas do acesso — senão a tela segue como se nada
// tivesse sido escolhido. Outra pessoa no mesmo aparelho, com outro acesso,
// cai nessa regra e não vê nada da anterior.
//
// Puro (sem Prisma e sem `next/headers`): o seletor, que é componente cliente,
// importa daqui. A leitura no servidor está em `empresaEscolhidaServidor.ts`.

export const COOKIE_DA_EMPRESA_DO_PORTAL = "portal_empresa";
export const CAMINHO_DO_COOKIE_DA_EMPRESA = "/portal";
const UM_ANO = 60 * 60 * 24 * 365;

/**
 * A empresa que a tela mostra: a da URL, se veio e é do acesso; senão a
 * guardada no cookie, se é do acesso; senão nenhuma (a tela decide o que
 * "nenhuma" quer dizer — todas, a primeira, ou "Escolha a empresa").
 *
 * A URL vence o cookie: o atalho do Início e o link copiado levam a empresa
 * deles, e o voltar do navegador volta para ela.
 */
export function empresaDaTela(
  pedida: string | string[] | null | undefined,
  guardada: string | null | undefined,
  permitidas: readonly string[]
): string | null {
  const daUrl = typeof pedida === "string" ? pedida : null;
  if (daUrl && permitidas.includes(daUrl)) return daUrl;
  if (guardada && permitidas.includes(guardada)) return guardada;
  return null;
}

/**
 * O endereço da tela com a empresa trocada. `manter` leva o que não muda com a
 * empresa (o mês da DRE, a competência dos documentos); o resto — a pasta dos
 * Arquivos, a página da lista — é da empresa anterior e fica para trás.
 * Sem empresa (`null`), a tela abre em "todas".
 */
export function enderecoComEmpresa(
  acao: string,
  empresaId: string | null,
  manter: Record<string, string | null | undefined> = {}
): string {
  const q = new URLSearchParams();
  if (empresaId) q.set("empresa", empresaId);
  for (const [k, v] of Object.entries(manter)) if (v && k !== "empresa") q.set(k, v);
  const s = q.toString();
  return s ? `${acao}?${s}` : acao;
}

/**
 * Grava a escolha (ou a apaga, com `null` — "Todas as empresas"). Só no
 * navegador; fora de componente, como `trocarTenant`, porque escreve em
 * `document.cookie`.
 */
export function guardarEmpresaDoPortal(empresaId: string | null): void {
  if (typeof document === "undefined") return;
  const valor = empresaId ? encodeURIComponent(empresaId) : "";
  const idade = empresaId ? UM_ANO : 0;
  document.cookie = `${COOKIE_DA_EMPRESA_DO_PORTAL}=${valor}; path=${CAMINHO_DO_COOKIE_DA_EMPRESA}; max-age=${idade}; samesite=lax`;
}

const MES_POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * "2026-10" → "outubro de 2026": o mês como o cliente fala, no filtro dos
 * documentos (P14). O que não for "AAAA-MM" volta como veio.
 */
export function mesPorExtensoDoPortal(competencia: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competencia);
  if (!m) return competencia;
  return MES_POR_EXTENSO.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}
