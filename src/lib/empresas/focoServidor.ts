// Uma empresa por vez no BPO (15/10/2026) — o que lê o cookie e o banco. A
// regra pura mora em `foco.ts`.
//
// O cookie é só a lembrança da escolha: a cada leitura a empresa é conferida
// de novo (existe, é deste escritório, está em atividade) e o grupo — a
// matriz e as filiais — sai do banco, então a filial cadastrada depois entra
// no foco sem ninguém escolher de novo, e a empresa excluída ou inativada
// encerra o foco sozinha.

import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { canViewSector, type AuthContext } from "@/lib/auth/context";
import { sessionCookieDomain } from "@/lib/auth/cookies";
import { getTenantModuleStates } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import {
  COOKIE_DO_FOCO,
  MODULOS_DO_FOCO,
  empresaDoCookie,
  lerCookieDoFoco,
  matrizDoFoco,
  motivoForaDoFoco,
  situacaoAceitaNoFoco,
  type EmpresaEmFoco,
} from "./foco";

/**
 * A empresa como foco desta pessoa: conferida no escritório e em atividade,
 * com a matriz e as filiais — ou `null`, quando não pode ser foco.
 */
export async function empresaParaOFoco(ctx: AuthContext, companyId: string): Promise<EmpresaEmFoco | null> {
  if (!ctx.tenantId || !companyId) return null;
  const prisma = getPrisma();
  // `id` depois do escopo, como em `ultimaEmpresa.ts`: nada no escopo troca a empresa.
  const empresa = await prisma.company.findFirst({
    where: { ...(await scopedCompanyWhere(ctx)), id: companyId },
    select: { id: true, name: true, displayName: true, logoUrl: true, status: true, parentCompanyId: true },
  });
  if (!empresa || !situacaoAceitaNoFoco(empresa.status)) return null;

  const matrizId = matrizDoFoco(empresa);
  const base = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, OR: [{ id: matrizId }, { parentCompanyId: matrizId }] },
    select: { id: true },
  });
  const grupo = new Set(base.map((e) => e.id));
  grupo.add(empresa.id);
  return { companyId: empresa.id, nome: nomeExibicao(empresa), logoUrl: empresa.logoUrl, matrizId, grupo: [...grupo] };
}

/**
 * A empresa em foco de quem está logado, já conferida — ou `null`, sem foco.
 * Sem o cookie (o caso de quase todo mundo), nem consulta o banco.
 */
export async function lerEmpresaEmFoco(ctx: AuthContext): Promise<EmpresaEmFoco | null> {
  const companyId = empresaDoCookie(lerCookieDoFoco((await cookies()).get(COOKIE_DO_FOCO)?.value), ctx);
  return companyId ? empresaParaOFoco(ctx, companyId) : null;
}

/**
 * A trava de gravação, num ponto só: por que a action deve recusar — ou
 * `null`, quando pode gravar (sem foco, ou com todas as empresas dentro dele).
 * Toda action que grava dinheiro nas telas do foco chama esta, com a empresa
 * de cada registro que vai mexer, antes de gravar.
 *
 * Erro de banco aqui sobe: na dúvida, a action não grava.
 */
export async function recusaDoFoco(ctx: AuthContext, companyIds: readonly string[]): Promise<string | null> {
  if (companyIds.length === 0) return null;
  return motivoForaDoFoco(await lerEmpresaEmFoco(ctx), companyIds);
}

/** Quem vê o setor de alguma tela do foco, com o módulo ligado, pode trabalhar numa empresa por vez. */
export async function podeUsarOFoco(ctx: AuthContext): Promise<boolean> {
  if (!ctx.tenantId || !ctx.userId) return false;
  const modulos = await getTenantModuleStates(ctx.tenantId);
  return modulos.some((m) => MODULOS_DO_FOCO.has(m.code) && m.enabled && canViewSector(ctx, m.sectorCode));
}

/**
 * As opções do cookie. Sem leitura pela tela (`httpOnly`): quem mostra o foco
 * é o servidor. Com o mesmo `domain` da sessão, para valer nos endereços por
 * setor (`bpo.…`) — sem ele, o foco escolhido na ficha, no endereço neutro,
 * não chegaria às telas do BPO. Apagar usa as mesmas opções, com `maxAge` 0.
 */
export function opcoesDoCookieDoFoco(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    domain: sessionCookieDomain(),
  };
}
