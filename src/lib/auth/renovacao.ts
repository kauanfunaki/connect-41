// Renovação da sessão da equipe pelo refresh token (13/11/2026, bug-693).
//
// Quem renova: o SessionKeeper, com a aba aberta (POST /api/auth/refresh), e
// quem abre um link com o access token vencido — o proxy manda a navegação
// para GET /api/auth/renovar, o único caminho que recebe o cookie do refresh
// (ele vale só em /api/auth). As duas rotas chamam `renovarSessao`.
//
// Cada refresh token vale uma vez: renovar grava o sucessor e revoga o usado.
// O cuidado é com o pedido simultâneo. O navegador manda vários pedidos ao
// mesmo tempo com o mesmo refresh token — a página e os prefetchs dos links
// quando o access token venceu, duas abas, o SessionKeeper ao voltar o foco
// junto de um clique. Antes, o segundo achava o token já revogado e levava
// 401, e o SessionKeeper mandava ao login uma sessão viva. Agora:
//
// - O sucessor é um só: o id dele sai do id do usado (`idDoSucessor`), e as
//   datas do token saem do registro dele. Quem chega depois re-assina o
//   MESMO token, e todas as respostas gravam o mesmo cookie.
// - Quem rotaciona é quem grava o sucessor: o id é chave primária, e quem
//   chega depois recebe "já existe" (P2002).
// - O usado ainda renova por `TOLERANCIA_MS` depois da rotação, e só enquanto
//   o sucessor estiver vivo: sair (logout), trocar a senha ou desativar a
//   conta revoga o sucessor, e a tolerância acaba junto.

import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { signAccess, signRefreshComDatas, verifyRefresh } from "@/lib/auth/jwt";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { REFRESH_MAX_AGE } from "@/lib/auth/cookies";

/** Por quanto tempo, depois da rotação, o refresh token usado ainda renova. */
export const TOLERANCIA_MS = 30_000;

export type Renovacao =
  | {
      ok: true;
      accessToken: string;
      /** O refresh token a gravar no cookie, e por quantos segundos. */
      refresh: { token: string; maxAge: number };
    }
  | { ok: false };

type Registro = { id: string; userId: string; tokenHash: string; expiresAt: Date; createdAt: Date; revokedAt: Date | null };

function hashDoToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** O id do sucessor de um refresh token — sempre o mesmo para o mesmo token. */
export function idDoSucessor(jti: string): string {
  const h = crypto.createHash("sha256").update(`sucessor:${jti}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** O token do sucessor, re-assinado a partir do registro: mesmo registro, mesmo token. */
function tokenDoRegistro(r: Registro): string {
  const iat = Math.floor(r.createdAt.getTime() / 1000);
  const exp = Math.floor(r.expiresAt.getTime() / 1000);
  return signRefreshComDatas({ sub: r.userId, jti: r.id }, { iat, exp });
}

function ehChaveRepetida(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * Renova a sessão com o refresh token do cookie: um access token novo e o
 * refresh token sucessor. `{ ok: false }` quando o token não vale (ausente,
 * assinatura, vencido, revogado fora da tolerância) ou a conta não está ativa.
 */
export async function renovarSessao(raw: string | undefined, agora: Date = new Date()): Promise<Renovacao> {
  if (!raw) return { ok: false };
  let jti: string;
  try {
    jti = verifyRefresh(raw).jti;
  } catch {
    return { ok: false };
  }

  const prisma = getPrisma();
  const usado = await prisma.refreshToken.findUnique({ where: { id: jti } });
  if (!usado || usado.tokenHash !== hashDoToken(raw) || usado.expiresAt <= agora) return { ok: false };

  const user = await prisma.user.findUnique({
    where: { id: usado.userId, active: true },
    include: { sectors: true },
  });
  if (!user) return { ok: false };

  const sucessorId = idDoSucessor(usado.id);
  let sucessor: Registro | null = null;
  if (!usado.revokedAt) {
    // Segundos inteiros nas duas datas: é delas que o token é re-assinado.
    const iat = Math.floor(agora.getTime() / 1000);
    const exp = iat + REFRESH_MAX_AGE;
    const token = signRefreshComDatas({ sub: user.id, jti: sucessorId }, { iat, exp });
    try {
      sucessor = await prisma.refreshToken.create({
        data: {
          id: sucessorId,
          userId: user.id,
          tokenHash: hashDoToken(token),
          createdAt: new Date(iat * 1000),
          expiresAt: new Date(exp * 1000),
        },
      });
    } catch (err) {
      // Outro pedido com o mesmo token rotacionou primeiro: segue pela tolerância.
      if (!ehChaveRepetida(err)) throw err;
    }
    if (sucessor) {
      await prisma.refreshToken.updateMany({ where: { id: usado.id, revokedAt: null }, data: { revokedAt: agora } });
    }
  }

  if (!sucessor) {
    const existente = await prisma.refreshToken.findUnique({ where: { id: sucessorId } });
    const vale =
      existente &&
      !existente.revokedAt &&
      existente.expiresAt > agora &&
      agora.getTime() - existente.createdAt.getTime() <= TOLERANCIA_MS;
    if (!vale) return { ok: false };
    sucessor = existente;
  }

  const refreshToken = tokenDoRegistro(sucessor);
  // Só falha se o segredo mudou entre a gravação e agora: o cookie não valeria.
  if (hashDoToken(refreshToken) !== sucessor.tokenHash) return { ok: false };

  const accessToken = signAccess({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sectors: user.sectors.map((s: { sectorCode: string }) => s.sectorCode),
    accessibleTenants: await getAccessibleTenantIds(user.id, user.role, user.tenantId),
  });
  const maxAge = Math.max(0, Math.ceil((sucessor.expiresAt.getTime() - agora.getTime()) / 1000));
  return { ok: true, accessToken, refresh: { token: refreshToken, maxAge } };
}
