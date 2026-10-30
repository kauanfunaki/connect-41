// Uma empresa por vez no BPO (15/10/2026) — o que lê o cookie e o banco. A
// regra pura mora em `foco.ts`.
//
// O cookie é só a lembrança da escolha: a cada leitura a empresa é conferida
// de novo (existe, é deste escritório, está em atividade) e o grupo — a
// matriz e as filiais — sai do banco, então a filial cadastrada depois entra
// no foco sem ninguém escolher de novo, e a empresa excluída ou inativada
// encerra o foco sozinha.

import { cache } from "react";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { canViewSector, type AuthContext } from "@/lib/auth/context";
import { sessionCookieDomain } from "@/lib/auth/cookies";
import { getTenantModuleStates } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { TODAS_AS_EMPRESAS } from "./escolhaDaEmpresa";
import {
  COOKIE_DO_FOCO,
  MODULOS_DO_FOCO,
  empresaDoCookie,
  focoLigadoNoSetor,
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
  return empresaConferida(ctx.tenantId, companyId);
}

// Uma vez por requisição (21/10/2026): o layout, a tela e o seletor leem o
// foco na mesma ida ao servidor. O escopo de empresa é o escritório inteiro
// (`scopedCompanyWhere`), então o tenant basta como chave.
const empresaConferida = cache(async (tenantId: string, companyId: string): Promise<EmpresaEmFoco | null> => {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { tenantId, id: companyId },
    select: { id: true, name: true, displayName: true, logoUrl: true, status: true, parentCompanyId: true },
  });
  if (!empresa || !situacaoAceitaNoFoco(empresa.status)) return null;

  const matrizId = matrizDoFoco(empresa);
  const base = await prisma.company.findMany({
    where: { tenantId, OR: [{ id: matrizId }, { parentCompanyId: matrizId }] },
    select: { id: true },
  });
  const grupo = new Set(base.map((e) => e.id));
  grupo.add(empresa.id);
  return { companyId: empresa.id, nome: nomeExibicao(empresa), logoUrl: empresa.logoUrl, matrizId, grupo: [...grupo] };
});

/**
 * A empresa em foco de quem está logado, já conferida — ou `null`, sem foco.
 * Sem o cookie (o caso de quase todo mundo), nem consulta o banco.
 */
export async function lerEmpresaEmFoco(ctx: AuthContext): Promise<EmpresaEmFoco | null> {
  const companyId = empresaDoCookie(lerCookieDoFoco((await cookies()).get(COOKIE_DO_FOCO)?.value), ctx);
  if (!companyId) return null;
  // A chave desligada no setor (29/10/2026) encerra o foco de quem já estava
  // nele: o cookie fica, mas não vale. Só quem tem o cookie paga a consulta.
  if (!(await podeUsarOFoco(ctx))) return null;
  return empresaParaOFoco(ctx, companyId);
}

/**
 * A trava de gravação, num ponto só: por que a action deve recusar — ou
 * `null`, quando pode gravar (sem foco, ou com todas as empresas dentro dele).
 * Toda action que grava dinheiro nas telas do foco chama esta, com a empresa
 * de cada registro que vai mexer (e a de destino, quando muda), antes de
 * gravar. A recusa é da gravação inteira: num lote, uma conta de fora basta.
 *
 * As empresas podem vir prontas ou numa função (21/10/2026): sem foco — o
 * caso de quase todo mundo —, a função nem roda, e a action não paga a
 * consulta a mais.
 *
 * Erro de banco aqui sobe: na dúvida, a action não grava.
 */
export async function recusaDoFoco(
  ctx: AuthContext,
  empresas: readonly (string | null | undefined)[] | (() => Promise<readonly (string | null | undefined)[]>)
): Promise<string | null> {
  if (Array.isArray(empresas) && empresas.length === 0) return null;
  const foco = await lerEmpresaEmFoco(ctx);
  if (!foco) return null;
  const lista = typeof empresas === "function" ? await empresas() : empresas;
  return motivoForaDoFoco(foco, lista.filter((id): id is string => typeof id === "string" && id.length > 0));
}

/**
 * As empresas dos lançamentos (contas a pagar e a receber), para a trava —
 * só as deste escritório; id de fora não entra (a action já não o acha).
 */
export function empresasDasContas(tenantId: string, entryIds: readonly string[]): () => Promise<string[]> {
  return async () => {
    if (entryIds.length === 0) return [];
    const linhas = await getPrisma().financeEntry.findMany({
      where: { tenantId, id: { in: [...entryIds] } },
      select: { companyId: true },
    });
    return linhas.map((l) => l.companyId);
  };
}

/** O que uma exportação lê, com o foco respeitado: a empresa pedida, ou as de "todas". */
export type LeituraNoFoco =
  | { ok: true; empresaId: string | undefined; empresaIds: string[] | undefined }
  | { ok: false; erro: string };

/**
 * A empresa de uma exportação (`?empresa=`), com o foco (21/10/2026): o
 * arquivo sai pelo endereço, sem passar pela tela, então a trava é aqui. Com
 * foco, "todas" é a base (matriz e filiais) e outra empresa é recusada; sem
 * foco, nada muda.
 */
export async function leituraNoFoco(ctx: AuthContext, empresa: string): Promise<LeituraNoFoco> {
  const foco = await lerEmpresaEmFoco(ctx);
  if (empresa === TODAS_AS_EMPRESAS) return { ok: true, empresaId: undefined, empresaIds: foco ? [...foco.grupo] : undefined };
  const recusa = motivoForaDoFoco(foco, [empresa], "exportar");
  return recusa ? { ok: false, erro: recusa } : { ok: true, empresaId: empresa, empresaIds: undefined };
}

/** Quem vê o setor de alguma tela do foco, com o módulo ligado, pode trabalhar numa empresa por vez. */
//
// Desde 29/10/2026, também com a chave do setor ligada (Configurações ›
// Setores, `Sector.companyFocus`). Uma vez por requisição: o layout, a ficha
// e a leitura do foco perguntam na mesma ida ao servidor.
export const podeUsarOFoco = cache(async (ctx: AuthContext): Promise<boolean> => {
  if (!ctx.tenantId || !ctx.userId) return false;
  const modulos = await getTenantModuleStates(ctx.tenantId);
  const setores = [...new Set(modulos.filter((m) => MODULOS_DO_FOCO.has(m.code) && m.enabled && canViewSector(ctx, m.sectorCode)).map((m) => m.sectorCode))];
  if (setores.length === 0) return false;
  const chaves = await getPrisma().sector.findMany({
    where: { tenantId: ctx.tenantId, code: { in: setores } },
    select: { code: true, companyFocus: true },
  });
  const desligados = new Set(chaves.filter((s) => !focoLigadoNoSetor(s.companyFocus)).map((s) => s.code));
  return setores.some((s) => !desligados.has(s));
});

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
