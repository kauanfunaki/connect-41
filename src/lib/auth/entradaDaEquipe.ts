import { HASH_DESCARTAVEL, verifyPassword } from "@/lib/auth/password";
import type { EscolhaDaEquipe } from "@/lib/auth/jwt";

// ─── A entrada da equipe com o mesmo e-mail em mais de um escritório ────────
//
// Achado em 02/10: o cadastro da equipe aceita o mesmo e-mail em dois
// escritórios (o `User` é único por tenant + e-mail), mas a entrada fazia
// `findFirst({ email })`: conferia a senha de UMA conta, a que o banco
// devolvesse primeiro. Quem tinha conta em dois escritórios caía sempre no
// mesmo — e, com senhas diferentes, a senha certa do outro era recusada.
//
// Decisão de 05/10: a equipe de todos os escritórios entra pelo mesmo endereço,
// e o escritório vem da conta de quem entra. Por isso a regra é a do portal
// (16/09): a senha é conferida em todas as contas ativas com o e-mail; uma que
// confere entra direto, como sempre; mais de uma vira a escolha do escritório,
// e a lista só aparece DEPOIS da senha certa — não revela quais escritórios
// existem. Este arquivo é a parte pura dessa decisão, testável sem banco.

/** Teto de contas com o mesmo e-mail: cada uma custa um bcrypt na entrada. */
export const MAX_CONTAS_POR_EMAIL = 10;

type ConfereSenha = (senha: string, hash: string) => Promise<boolean>;

/**
 * As contas cuja senha confere.
 *
 * Confere TODAS, sem parar na primeira: a conta certa pode ser a segunda, e
 * parar antes faria o tempo dizer em que posição ela estava. Sem conta, roda
 * uma conferência contra o hash descartável — o caso de um e-mail (a imensa
 * maioria) leva o mesmo tempo exista a conta ou não.
 *
 * Limite conhecido: com duas ou mais contas, a resposta leva um bcrypt a mais
 * por conta (~0,2 s cada). Quem cronometra descobre que o e-mail tem mais de
 * uma conta — não quais escritórios, que só aparecem depois da senha certa.
 * Igualar isso custaria um bcrypt extra em toda entrada de todo mundo.
 */
export async function contasQueConferem<T extends { passwordHash: string }>(
  senha: string,
  contas: readonly T[],
  conferir: ConfereSenha = verifyPassword
): Promise<T[]> {
  if (contas.length === 0) {
    await conferir(senha, HASH_DESCARTAVEL);
    return [];
  }
  const conferem: T[] = [];
  for (const conta of contas) {
    if (await conferir(senha, conta.passwordHash)) conferem.push(conta);
  }
  return conferem;
}

export type DecisaoDaEntrada<T> =
  /** Nenhuma senha conferiu (ou não há conta): a mesma mensagem de sempre. */
  | { tipo: "recusar" }
  /** Uma conta: entra direto, exatamente como antes de 06/10. */
  | { tipo: "entrar"; conta: T }
  /** Mais de uma: a pessoa escolhe o escritório. */
  | { tipo: "escolher"; contas: T[] };

export function decidirEntrada<T>(conferem: readonly T[]): DecisaoDaEntrada<T> {
  if (conferem.length === 0) return { tipo: "recusar" };
  if (conferem.length === 1) return { tipo: "entrar", conta: conferem[0]! };
  return { tipo: "escolher", contas: [...conferem] };
}

export type ResultadoDaEscolha =
  /** A conta escolhida, com o "lembrar" e o destino do primeiro passo. */
  | { ok: true; contaId: string; lembrar: boolean; next: string | null }
  /** Token vencido, adulterado, ausente ou sem contas: volta ao login. */
  | { ok: false; motivo: "expirou" }
  /** Um id que a senha não liberou: o servidor só aceita os que estão no token. */
  | { ok: false; motivo: "fora-da-lista" };

/**
 * Confere a escolha do segundo passo contra o token. É aqui que um id
 * inventado no formulário (de outra conta, de outro escritório) é recusado: só
 * vale o que a senha liberou no primeiro passo. O `next` passa de novo pelo
 * `safeNext` — veio assinado, mas a regra do destino mora num lugar só.
 */
export function conferirEscolha(liberada: EscolhaDaEquipe | null, escolhida: string): ResultadoDaEscolha {
  if (!liberada || liberada.contas.length === 0) return { ok: false, motivo: "expirou" };
  if (!escolhida || !liberada.contas.includes(escolhida)) return { ok: false, motivo: "fora-da-lista" };
  return { ok: true, contaId: escolhida, lembrar: liberada.lembrar, next: safeNext(liberada.next) };
}

/**
 * Só aceita destino relativo interno ("/algo") — senão o "next" vindo da query
 * vira open-redirect. Recusa também o que o navegador LÊ como outro host:
 * "//host" (protocol-relative), "/\host" (a barra invertida vira barra) e
 * caracteres de controle (tab e quebra de linha somem na leitura da URL, e
 * "/\t/host" vira "//host").
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

// ─── O cookie da escolha ────────────────────────────────────────────────────
//
// O token da escolha (as contas liberadas, o "lembrar" e o `next`) vai num
// cookie httpOnly, e não na URL nem no HTML: ids de conta não ficam em
// histórico, log de proxy ou cabeçalho Referer. O caminho restrito faz o
// navegador mandá-lo só para a tela da escolha e para o envio dela
// (`/login/escritorio/entrar`), e ele vence em poucos minutos — o token dentro
// dele também.

export const COOKIE_DA_ESCOLHA_DA_EQUIPE = "equipe_escolha";
export const CAMINHO_DA_ESCOLHA_DA_EQUIPE = "/login/escritorio";
export const MINUTOS_DA_ESCOLHA_DA_EQUIPE = 5;

/** `maxAge` em segundos; 0 apaga. Host-only (sem `domain`): a escolha acontece no mesmo endereço da entrada. */
export function opcoesDoCookieDaEscolha(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: CAMINHO_DA_ESCOLHA_DA_EQUIPE,
    maxAge,
  };
}
