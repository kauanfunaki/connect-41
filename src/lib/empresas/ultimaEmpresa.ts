// A última empresa aberta por pessoa e workspace (13/10/2026) — a leitura, a
// gravação e a escolha da empresa de uma tela. A regra pura mora em
// `escolhaDaEmpresa.ts`; aqui, o que toca o banco.
//
// Grava quando a pessoa abre a ficha da empresa (`/empresas/[id]`) ou escolhe
// uma empresa no seletor de uma tela (`registrarEmpresaAberta`). Ler a URL de
// uma tela não grava: um link de notificação para outra empresa não troca o
// padrão de quem só foi olhar.
//
// A linha não tem chave estrangeira (ver o model `UserLastCompany`), então a
// leitura confere tudo de novo: a empresa existe, é deste tenant e a pessoa a
// enxerga (`scopedCompanyWhere`, a mesma régua da ficha). Se não, é como se
// não houvesse última — e a tela pede para escolher.
//
// Erro de banco (inclusive a tabela ainda não existir, se o deploy vier antes
// da migration) não derruba tela nenhuma: ler devolve "nenhuma" e gravar não
// grava.

import { getPrisma } from "@/lib/prisma";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import type { AuthContext } from "@/lib/auth/context";
import { resolverEmpresaDaTela, type EscolhaDaEmpresa } from "./escolhaDaEmpresa";

/** Confere que a empresa existe e que a pessoa a enxerga neste tenant. */
async function empresaVisivel(ctx: AuthContext, companyId: string): Promise<boolean> {
  // `id` depois do escopo: o escopo traz o tenant, e nada nele pode trocar a empresa.
  const empresa = await getPrisma().company.findFirst({
    where: { ...(await scopedCompanyWhere(ctx)), id: companyId },
    select: { id: true },
  });
  return empresa !== null;
}

/** A última empresa aberta, já conferida — ou `null`. */
export async function lerUltimaEmpresa(ctx: AuthContext): Promise<string | null> {
  if (!ctx.userId || !ctx.tenantId) return null;
  try {
    const linha = await getPrisma().userLastCompany.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      select: { companyId: true },
    });
    if (!linha) return null;
    return (await empresaVisivel(ctx, linha.companyId)) ? linha.companyId : null;
  } catch (err) {
    console.error("[lerUltimaEmpresa]", err);
    return null;
  }
}

/** Grava a empresa como a última aberta. `false` quando ela não é visível ou o banco recusou. */
export async function gravarUltimaEmpresa(ctx: AuthContext, companyId: string): Promise<boolean> {
  if (!ctx.userId || !ctx.tenantId || !companyId) return false;
  try {
    if (!(await empresaVisivel(ctx, companyId))) return false;
    const agora = new Date();
    await getPrisma().userLastCompany.upsert({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      create: { userId: ctx.userId, tenantId: ctx.tenantId, companyId, openedAt: agora },
      update: { companyId, openedAt: agora },
    });
    return true;
  } catch (err) {
    // Duas abas gravando ao mesmo tempo, ou a tabela ainda não existe: a
    // preferência fica como estava, e a tela segue.
    console.error("[gravarUltimaEmpresa]", err);
    return false;
  }
}

export type EmpresaDaTela<E> = {
  escolha: EscolhaDaEmpresa;
  /** A empresa escolhida, da lista da tela — `null` em "todas" e em "escolher". */
  empresa: E | null;
};

/**
 * A empresa que a tela abre: a da URL, a última aberta, a única da lista — ou
 * nenhuma, e a tela pede para escolher. Ver `resolverEmpresaDaTela`.
 *
 * `empresas` é a lista que a tela oferece no seletor; a empresa da URL e a
 * última aberta só valem se estiverem nela — é assim que a tela respeita o
 * recorte dela (só ativas, só com conta do Omie…).
 */
export async function escolherEmpresaDaTela<E extends { id: string }>(
  ctx: AuthContext,
  pedida: string | null | undefined,
  empresas: E[],
  opcoes: { permitirTodas?: boolean } = {}
): Promise<EmpresaDaTela<E>> {
  // Com a empresa na URL, a última não decide nada — a consulta a mais fica de fora.
  const ultima = pedida?.trim() ? null : await lerUltimaEmpresa(ctx);
  const escolha = resolverEmpresaDaTela({
    pedida,
    ultima,
    disponiveis: empresas.map((e) => e.id),
    permitirTodas: opcoes.permitirTodas,
  });
  const empresa = escolha.tipo === "empresa" ? (empresas.find((e) => e.id === escolha.companyId) ?? null) : null;
  return { escolha, empresa };
}
