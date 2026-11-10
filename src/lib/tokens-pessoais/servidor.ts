import { createHash, randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isFullWrite, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { isModuleEnabled } from "@/lib/modules";
import { isSubscriptionReadOnly } from "@/lib/subscription-policy";
import { MODULO_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { MODULO_ACADEMIA } from "@/lib/academia/regras";
import type { AtorTech } from "@/lib/tech-interno/servidor";
import { ErroApi } from "@/lib/api-v1/erros";
import {
  PREFIXO_DO_TOKEN, MAXIMO_DE_TOKENS_ATIVOS, novoTokenSchema, gravarEscopos, lerEscopos, pistaDoToken,
  situacaoDoToken, tokenDoCabecalho, type Escopo, type SituacaoDoToken,
} from "./regras";

// O token pessoal no banco (05/11/2026). Fica só o hash (SHA-256 de 256 bits
// aleatórios: não precisa de sal nem de hash lento). O token em claro aparece
// uma vez, na resposta de quem o criou, e nunca vai para log nem para URL.

export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** O que a tela mostra de um token. Nunca o hash. */
export type TokenListado = {
  id: string; name: string; hint: string; scopes: Escopo[]; situacao: SituacaoDoToken;
  expiresAt: string; lastUsedAt: string | null; createdAt: string; revokedAt: string | null;
  userId: string; userName: string; proprio: boolean;
};

const camposListados = {
  id: true, name: true, hint: true, scopes: true, expiresAt: true, lastUsedAt: true, createdAt: true, revokedAt: true,
  userId: true, user: { select: { name: true } },
} as const;
type Registro = { id: string; name: string; hint: string; scopes: string; expiresAt: Date; lastUsedAt: Date | null; createdAt: Date; revokedAt: Date | null; userId: string; user: { name: string } };
function paraTela(t: Registro, ctx: AuthContext, agora = new Date()): TokenListado {
  return {
    id: t.id, name: t.name, hint: t.hint, scopes: lerEscopos(t.scopes), situacao: situacaoDoToken(t, agora),
    expiresAt: t.expiresAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(), revokedAt: t.revokedAt?.toISOString() ?? null,
    userId: t.userId, userName: t.user.name, proprio: t.userId === ctx.userId,
  };
}

/** Os tokens da própria pessoa: ativos primeiro, depois os vencidos e revogados recentes. */
export async function listarMeusTokens(ctx: AuthContext): Promise<TokenListado[]> {
  if (!ctx.userId || !ctx.tenantId) return [];
  const tokens = await getPrisma().personalApiToken.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: camposListados,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100,
  });
  return ordenar(tokens.map(t => paraTela(t, ctx)));
}

/** Para o administrador: os tokens ativos de todo o escritório, para revogar o que não deve existir. */
export async function listarTokensDoEscritorio(ctx: AuthContext): Promise<TokenListado[] | null> {
  if (!ctx.userId || !ctx.tenantId || !isFullWrite(ctx.role)) return null;
  const tokens = await getPrisma().personalApiToken.findMany({
    where: { tenantId: ctx.tenantId, revokedAt: null, expiresAt: { gt: new Date() } }, select: camposListados,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 500,
  });
  return tokens.map(t => paraTela(t, ctx));
}
const PESO: Record<SituacaoDoToken, number> = { ativo: 0, vencido: 1, revogado: 2 };
const ordenar = (lista: TokenListado[]) => [...lista].sort((a, b) => PESO[a.situacao] - PESO[b.situacao]);

/**
 * Cria o token e devolve o token em claro, uma única vez. A pessoa só cria o
 * escopo que ela própria alcança hoje: ler pede ver o Controle interno;
 * escrever pede poder agir nele.
 */
export async function criarTokenPessoal(ctx: AuthContext, raw: unknown): Promise<{ token: string; registro: TokenListado }> {
  if (!ctx.userId || !ctx.tenantId) throw new ErroApi("unauthenticated", "Entre novamente para continuar.");
  // Quem troca de escritório (o Super Admin) cria o token no escritório de origem.
  if (ctx.tenantId !== ctx.homeTenantId) throw new ErroApi("forbidden", "Crie o token no seu escritório de origem.");
  const parsed = novoTokenSchema.safeParse(raw);
  if (!parsed.success) throw new ErroApi("validation_error", parsed.error.issues[0].message);
  const { name, scopes, days } = parsed.data;
  if (scopes.includes("controle-interno:escrever") && !await podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")) {
    throw new ErroApi("forbidden", "Você não pode criar nem alterar itens do Controle interno, então o token também não pode.");
  }
  // A tela dos tokens mora no Controle interno, e só quem o vê cria token.
  if (!await podeNoModulo(ctx, MODULO_TECH_INTERNO, "ver")) throw new ErroApi("forbidden", "O Controle interno não está disponível para você.");
  // O ranking da Academia (10/11/2026) é de toda a equipe: basta o módulo ligado.
  if (scopes.includes("academia:ler") && !await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA)) {
    throw new ErroApi("forbidden", "A Academia está desligada neste escritório.");
  }

  const db = getPrisma(), agora = new Date();
  const ativos = await db.personalApiToken.count({ where: { tenantId: ctx.tenantId, userId: ctx.userId, revokedAt: null, expiresAt: { gt: agora } } });
  if (ativos >= MAXIMO_DE_TOKENS_ATIVOS) throw new ErroApi("validation_error", `Você já tem ${MAXIMO_DE_TOKENS_ATIVOS} tokens ativos. Revogue um que não usa mais antes de criar outro.`);

  const token = `${PREFIXO_DO_TOKEN}${randomBytes(32).toString("hex")}`;
  const registro = await db.personalApiToken.create({
    data: {
      tenantId: ctx.tenantId, userId: ctx.userId, name, tokenHash: hashDoToken(token), hint: pistaDoToken(token),
      scopes: gravarEscopos(scopes), expiresAt: new Date(agora.getTime() + days * 864e5),
    },
    select: camposListados,
  });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "token_pessoal.create", entityType: "PersonalApiToken", entityId: registro.id, metadata: { nome: name, escopos: registro.scopes, dias: days } });
  return { token, registro: paraTela(registro, ctx, agora) };
}

/** Revoga um token: o próprio, ou qualquer um do escritório para o administrador. Repetir não muda nada. */
export async function revogarTokenPessoal(ctx: AuthContext, id: string): Promise<TokenListado> {
  if (!ctx.userId || !ctx.tenantId) throw new ErroApi("unauthenticated", "Entre novamente para continuar.");
  const db = getPrisma();
  const atual = await db.personalApiToken.findFirst({ where: { id, tenantId: ctx.tenantId }, select: camposListados });
  if (!atual || (atual.userId !== ctx.userId && !isFullWrite(ctx.role))) throw new ErroApi("not_found", "Token não encontrado.");
  if (atual.revokedAt) return paraTela(atual, ctx);
  const agora = new Date();
  await db.personalApiToken.updateMany({ where: { id, tenantId: ctx.tenantId, revokedAt: null }, data: { revokedAt: agora, revokedById: ctx.userId } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "token_pessoal.revoke", entityType: "PersonalApiToken", entityId: id, metadata: { nome: atual.name, ...(atual.userId !== ctx.userId ? { dono: atual.user.name } : {}) } });
  return paraTela({ ...atual, revokedAt: agora }, ctx, agora);
}

/** Quem age por um token: a pessoa dona dele, com os escopos do token. */
export type AtorDoToken = AtorTech & { via: { tokenId: string; tokenName: string }; escopos: Escopo[] };

const dataLegivel = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const CRIAR_OUTRO = "Crie outro em Configurações › Sua conta › Tokens de acesso.";

/**
 * Confere o token do cabeçalho `Authorization: Bearer c41_…` e devolve quem
 * age. Mesma régua das chaves do Ops Center: escritório ativo, assinatura que
 * não está somente leitura e módulo ligado. O papel e os setores são os de
 * hoje da pessoa — mudou o acesso dela, mudou o do token.
 *
 * `escopo`, quando informado, precisa estar no token.
 */
export async function autenticarTokenPessoal(request: Request, escopo?: Escopo): Promise<AtorDoToken> {
  const token = tokenDoCabecalho(request.headers.get("authorization"));
  if (!token) {
    throw new ErroApi("unauthenticated", "Envie o token pessoal no cabeçalho \"Authorization: Bearer c41_…\". Ele é criado em Configurações › Sua conta › Tokens de acesso.");
  }
  const db = getPrisma();
  const registro = await db.personalApiToken.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: {
      id: true, tenantId: true, name: true, scopes: true, expiresAt: true, revokedAt: true, lastUsedAt: true,
      tenant: { select: { active: true, subscription: { select: { status: true } } } },
      user: { select: { id: true, tenantId: true, active: true, role: true, sectors: { select: { sectorCode: true } } } },
    },
  });
  if (!registro) throw new ErroApi("invalid_token", `Token inválido. Confira se copiou o token inteiro. ${CRIAR_OUTRO}`);
  if (registro.revokedAt) throw new ErroApi("revoked_token", `Este token foi revogado em ${dataLegivel(registro.revokedAt)}. ${CRIAR_OUTRO}`);
  const agora = new Date();
  if (registro.expiresAt.getTime() <= agora.getTime()) throw new ErroApi("expired_token", `Este token venceu em ${dataLegivel(registro.expiresAt)}. ${CRIAR_OUTRO}`);
  if (!registro.user.active || registro.user.tenantId !== registro.tenantId) throw new ErroApi("invalid_token", "A pessoa dona deste token não está mais ativa neste escritório.");
  if (!registro.tenant.active || isSubscriptionReadOnly(registro.tenant.subscription?.status)) {
    throw new ErroApi("office_unavailable", "O escritório deste token está indisponível ou com a assinatura somente leitura.");
  }
  // O módulo que vale é o do escopo da rota (10/11/2026): o ranking da Academia
  // pede a Academia ligada, e não o Controle interno. Sem escopo (o MCP), o
  // Controle interno, como antes.
  if (escopo === "academia:ler") {
    if (!await isModuleEnabled(registro.tenantId, MODULO_ACADEMIA)) throw new ErroApi("module_disabled", "A Academia está desligada neste escritório.");
  } else if (!await isModuleEnabled(registro.tenantId, MODULO_TECH_INTERNO)) {
    throw new ErroApi("module_disabled", "O Controle interno está desligado neste escritório.");
  }
  const escopos = lerEscopos(registro.scopes);
  if (escopo && !escopos.includes(escopo)) throw new ErroApi("insufficient_scope", `Este token não tem o escopo "${escopo}". Crie um token com esse escopo para esta ação.`);

  // O último uso, no máximo uma gravação por minuto por token. Falhar aqui não barra a chamada.
  if (!registro.lastUsedAt || agora.getTime() - registro.lastUsedAt.getTime() > 60_000) {
    await db.personalApiToken.updateMany({ where: { id: registro.id }, data: { lastUsedAt: agora } }).catch(() => undefined);
  }
  return {
    userId: registro.user.id, tenantId: registro.tenantId, homeTenantId: registro.tenantId, role: registro.user.role,
    sectors: registro.user.sectors.map(s => s.sectorCode), subscriptionReadOnly: false, canSelfRegularizeSubscription: false,
    activeSector: null, via: { tokenId: registro.id, tokenName: registro.name }, escopos,
  };
}
