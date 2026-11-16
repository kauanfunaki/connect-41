// A lista de empresas da tela inicial dos Arquivos: quantos documentos cada uma
// tem e o que o cliente mandou que a equipe ainda não abriu. Regras puras em
// ./listaDeEmpresas.
//
// Desde 16/11/2026 (melhoria-716) são duas listas com a mesma conta: a do
// início (as ativas, 12 por página) e o grupo "Empresas" do resultado da busca
// (as que batem com o termo, com teto). A busca própria da lista saiu.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { nomeExibicao } from "@/lib/companyName";
import { caminhoDaPasta, caminhoNaLixeira, CHAVE_ENVIADOS, mapaDePastas, podeVerCaminho } from "./regras";
import { SELECT_PASTA } from "./servidor";
import { totaisDoConnect } from "./doConnect";
import { MAXIMO_DE_EMPRESAS, empresasDoTermo } from "./busca";
import { novosPorPasta, ordenarEmpresas, paginar, type EmpresaNaLista } from "./listaDeEmpresas";

export type EmpresaDosArquivos = EmpresaNaLista & {
  /** Arquivos + "Do Connect": o número da etiqueta. */
  documentos: number;
  /** Abre direto em "Enviados pelo cliente" quando há novidade. */
  pastaDeEnviados: string | null;
};

const SELECT_EMPRESA = { id: true, name: true, displayName: true, cnpj: true } as const;
type EmpresaDoBanco = { id: string; name: string; displayName: string | null; cnpj: string | null };

/** A lista do início: as empresas ativas, quem tem envio novo do cliente primeiro, 12 por página. */
export async function empresasDosArquivos(
  ctx: AuthContext,
  { pagina, agora = new Date() }: { pagina: number; agora?: Date }
): Promise<{ itens: EmpresaDosArquivos[]; pagina: number; paginas: number; total: number; comNovidade: number }> {
  const empresas = await getPrisma().company.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: SELECT_EMPRESA,
  });
  if (empresas.length === 0) return { itens: [], pagina: 1, paginas: 1, total: 0, comNovidade: 0 };

  const { lista, enviadosDa } = await contarNasPastas(ctx, empresas, agora);
  const pag = paginar(ordenarEmpresas(lista, false), pagina);
  return {
    ...pag,
    // O "Do Connect" só da página: contar os módulos das 400 empresas a cada
    // abertura da tela custaria seis varreduras grandes para mostrar doze linhas.
    itens: await comODoConnect(ctx, pag.itens, enviadosDa),
    comNovidade: lista.filter((e) => e.novos > 0).length,
  };
}

/**
 * O grupo "Empresas" do resultado da busca (16/11/2026, melhoria-716): as
 * empresas que batem com o termo (`empresasDoTermo`), até `limite` — nunca
 * mais que 40 —, e quantas batem ao todo. O banco corta pela razão social; as
 * que ficaram à vista saem na ordem da lista com busca: envio novo do cliente
 * primeiro, depois o nome. A conta dos documentos e a régua das pastas são as
 * da lista do início, só para as empresas que voltaram.
 */
export async function empresasDaBusca(
  ctx: AuthContext,
  { termo, limite, agora = new Date() }: { termo: string; limite: number; agora?: Date }
): Promise<{ itens: EmpresaDosArquivos[]; total: number }> {
  const where = empresasDoTermo(ctx.tenantId, termo);
  if (!where) return { itens: [], total: 0 };
  const prisma = getPrisma();
  const [empresas, total] = await Promise.all([
    prisma.company.findMany({
      where,
      // O `id` desempata duas empresas de mesma razão social, para o "Mostrar
      // mais" só acrescentar.
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: Math.min(Math.max(1, Math.floor(limite) || 1), MAXIMO_DE_EMPRESAS),
      select: SELECT_EMPRESA,
    }),
    prisma.company.count({ where }),
  ]);
  if (empresas.length === 0) return { itens: [], total: 0 };

  const { lista, enviadosDa } = await contarNasPastas(ctx, empresas, agora);
  return { itens: await comODoConnect(ctx, ordenarEmpresas(lista, true), enviadosDa), total: Math.max(total, empresas.length) };
}

/**
 * Para as empresas dadas: quantos arquivos cada uma tem nas pastas que quem
 * pede vê, e o que o cliente mandou que a equipe ainda não abriu.
 */
async function contarNasPastas(
  ctx: AuthContext,
  empresas: EmpresaDoBanco[],
  agora: Date
): Promise<{ lista: EmpresaNaLista[]; enviadosDa: Map<string, string> }> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const ids = empresas.map((e) => e.id);

  // As pastas das empresas, para contar só o que quem pede vê (pasta de setor,
  // lixeira) — a mesma régua do navegador.
  const [pastas, porPasta, envios, vistas] = await Promise.all([
    prisma.driveFolder.findMany({ where: { tenantId, companyId: { in: ids } }, select: SELECT_PASTA }),
    prisma.driveFile.groupBy({
      by: ["folderId"],
      where: { tenantId, deletedAt: null, folder: { companyId: { in: ids } } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.driveFile.findMany({
      where: { tenantId, deletedAt: null, uploadedByPortalUserId: { not: null }, folder: { companyId: { in: ids } } },
      select: { folderId: true, createdAt: true },
    }),
    prisma.driveFolderSeen.findMany({ where: { tenantId }, select: { folderId: true, seenAt: true } }),
  ]);
  const mapa = mapaDePastas(pastas);
  const visivel = new Map<string, string>(); // pasta visível → empresa
  const enviadosDa = new Map<string, string>(); // empresa → pasta de envios
  for (const p of pastas) {
    const c = caminhoDaPasta(p.id, mapa);
    if (!p.companyId || !c || caminhoNaLixeira(c) || !podeVerCaminho(ctx, c)) continue;
    visivel.set(p.id, p.companyId);
    if (p.systemKey === CHAVE_ENVIADOS) enviadosDa.set(p.companyId, p.id);
  }

  const novos = novosPorPasta(
    envios.filter((e) => visivel.has(e.folderId)).map((e) => ({ folderId: e.folderId, criadoEm: e.createdAt })),
    new Map(vistas.map((v) => [v.folderId, v.seenAt])),
    agora
  );
  const porEmpresa = new Map<string, { arquivos: number; ultimo: Date | null; novos: number; ultimoNovo: Date | null }>();
  const daEmpresa = (id: string) => {
    let e = porEmpresa.get(id);
    if (!e) porEmpresa.set(id, (e = { arquivos: 0, ultimo: null, novos: 0, ultimoNovo: null }));
    return e;
  };
  for (const g of porPasta) {
    const companyId = visivel.get(g.folderId);
    if (!companyId) continue;
    const e = daEmpresa(companyId);
    e.arquivos += g._count._all;
    if (g._max.createdAt && (!e.ultimo || g._max.createdAt > e.ultimo)) e.ultimo = g._max.createdAt;
  }
  for (const [folderId, n] of novos) {
    const e = daEmpresa(visivel.get(folderId)!);
    e.novos += n.novos;
    if (!e.ultimoNovo || n.ultimo > e.ultimoNovo) e.ultimoNovo = n.ultimo;
  }

  const lista: EmpresaNaLista[] = empresas.map((emp) => {
    const e = porEmpresa.get(emp.id);
    return {
      id: emp.id,
      nome: nomeExibicao(emp),
      cnpj: emp.cnpj,
      arquivos: e?.arquivos ?? 0,
      novos: e?.novos ?? 0,
      ultimoNovo: e?.ultimoNovo ?? null,
      ultimoMovimento: e?.ultimo ?? null,
    };
  });
  return { lista, enviadosDa };
}

/** Soma o "Do Connect" de cada empresa da lista (só as que vão para a tela). */
async function comODoConnect(ctx: AuthContext, itens: EmpresaNaLista[], enviadosDa: ReadonlyMap<string, string>): Promise<EmpresaDosArquivos[]> {
  const doConnect = await totaisDoConnect(
    ctx,
    itens.map((e) => e.id)
  );
  return itens.map((e) => ({
    ...e,
    documentos: e.arquivos + (doConnect.get(e.id) ?? 0),
    pastaDeEnviados: enviadosDa.get(e.id) ?? null,
  }));
}
