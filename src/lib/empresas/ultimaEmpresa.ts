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
import { pedidaForaDoFoco, resolverEmpresaDaTela, TODAS_AS_EMPRESAS, type EscolhaDaEmpresa } from "./escolhaDaEmpresa";
import { lerEmpresaEmFoco } from "./focoServidor";
import type { EmpresaEmFoco } from "./foco";

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

/** A empresa em foco, como a tela a mostra — e o que a URL pediu fora dele. */
export type FocoNaTela = EmpresaEmFoco & {
  /**
   * O que a URL pediu fora do foco — "todas as empresas", ou o nome da
   * empresa —, quando pediu: a tela ficou na empresa em foco e avisa.
   */
  pedida: string | null;
};

export type EmpresaDaTela<E> = {
  escolha: EscolhaDaEmpresa;
  /** A empresa escolhida, da lista da tela — `null` em "todas" e em "escolher". */
  empresa: E | null;
  /** O que o seletor oferece: com foco, só a matriz e as filiais; sem foco, a lista da tela. */
  noSeletor: E[];
  /** A empresa em foco, nas telas que seguem o foco (`comFoco`); `null` sem foco. */
  foco: FocoNaTela | null;
  /**
   * O que "Todas" cobre (21/10/2026): com foco, a matriz e as filiais da base;
   * sem foco, `null` — o escritório inteiro, como sempre.
   */
  empresasDeTodas: string[] | null;
};

function nomeNaLista(e: object): string | null {
  const { nome, name } = e as { nome?: unknown; name?: unknown };
  return typeof nome === "string" ? nome : typeof name === "string" ? name : null;
}

/**
 * A empresa que a tela abre: a da URL, a última aberta, a única da lista — ou
 * nenhuma, e a tela pede para escolher. Ver `resolverEmpresaDaTela`.
 *
 * `empresas` é a lista que a tela oferece no seletor; a empresa da URL e a
 * última aberta só valem se estiverem nela — é assim que a tela respeita o
 * recorte dela (só ativas, só com conta do Omie…).
 *
 * `comFoco` (15/10/2026): as telas do BPO que seguem a empresa em foco. Com
 * foco, a tela abre nela e o seletor (`noSeletor`) só oferece a matriz e as
 * filiais; sem foco, nada muda.
 */
export async function escolherEmpresaDaTela<E extends { id: string }>(
  ctx: AuthContext,
  pedida: string | null | undefined,
  empresas: E[],
  opcoes: { permitirTodas?: boolean; comFoco?: boolean } = {}
): Promise<EmpresaDaTela<E>> {
  const foco = opcoes.comFoco ? await lerEmpresaEmFoco(ctx) : null;
  // Com a empresa na URL, a última não decide nada — e, com a empresa em foco
  // na lista, também não: a consulta a mais fica de fora.
  const semUltima = !!pedida?.trim() || (foco !== null && empresas.some((e) => e.id === foco.companyId));
  const ultima = semUltima ? null : await lerUltimaEmpresa(ctx);
  const entrada = { pedida, disponiveis: empresas.map((e) => e.id), permitirTodas: opcoes.permitirTodas, foco };
  const escolha = resolverEmpresaDaTela({ ...entrada, ultima });
  const empresa = escolha.tipo === "empresa" ? (empresas.find((e) => e.id === escolha.companyId) ?? null) : null;
  if (!foco) return { escolha, empresa, noSeletor: empresas, foco: null, empresasDeTodas: null };

  const pedidaLimpa = pedida?.trim() ?? "";
  const daUrl = pedidaForaDoFoco(entrada)
    ? pedidaLimpa === TODAS_AS_EMPRESAS
      ? "todas as empresas"
      : (nomeNaLista(empresas.find((e) => e.id === pedidaLimpa)!) ?? "outra empresa")
    : null;
  return {
    escolha,
    empresa,
    noSeletor: empresas.filter((e) => foco.grupo.includes(e.id)),
    foco: { ...foco, pedida: daUrl },
    empresasDeTodas: [...foco.grupo],
  };
}
