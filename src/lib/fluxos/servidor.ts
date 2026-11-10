// A leitura do banco do Repositório de fluxos (10/11/2026, pedido do Kauan).
// As regras moram em `regras.ts`, `etapas.ts` e `desenho.ts`, sem Prisma,
// porque a tela de cliente importa de lá.

import { unlink } from "node:fs/promises";
import path from "node:path";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { lerListaDeEtapas } from "./etapas";
import { dataDoBanco } from "./regras";
import { ehArquivoGuardado } from "./arquivos";
import type { FluxoAberto, PastaDaArvore, Pessoa, VersaoAberta } from "./tipos";

/** A pasta, com o setor — ou nula, se não é deste escritório. */
export async function pastaDoEscritorio(ctx: Pick<AuthContext, "tenantId">, pastaId: string) {
  if (!ctx.tenantId) return null;
  return getPrisma().flowFolder.findFirst({ where: { id: pastaId, tenantId: ctx.tenantId }, select: { id: true, sectorCode: true, title: true } });
}

/** O fluxo, com o setor da pasta dele — ou nulo, se não é deste escritório. */
export async function fluxoDoEscritorio(ctx: Pick<AuthContext, "tenantId">, fluxoId: string) {
  if (!ctx.tenantId) return null;
  return getPrisma().flowDoc.findFirst({
    where: { id: fluxoId, tenantId: ctx.tenantId },
    select: { id: true, title: true, version: true, folderId: true, folder: { select: { sectorCode: true } } },
  });
}

/** O caminho no disco de um anexo — o nome gravado é conferido, e a pasta é a do escritório. */
export function caminhoDoAnexo(tenantId: string, guardado: string): string | null {
  if (!ehArquivoGuardado(guardado)) return null;
  return path.join(process.cwd(), "storage", "fluxos", tenantId, guardado);
}

/** Apaga os arquivos do disco depois que as linhas saíram do banco. Arquivo que já não existe não é erro. */
export async function apagarArquivosDosAnexos(tenantId: string, guardados: readonly string[]): Promise<void> {
  await Promise.all(
    guardados.map(async (g) => {
      const caminho = caminhoDoAnexo(tenantId, g);
      if (!caminho) return;
      await unlink(caminho).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") console.error("[fluxos] apagar anexo", err);
      });
    })
  );
}

/**
 * Quem pode ser dono de um fluxo do setor: as pessoas ativas do setor (menos o
 * Somente leitura). O dono atual fica na lista mesmo se mudou de setor — para
 * o seletor não esconder o que está gravado.
 */
export async function pessoasDoSetor(tenantId: string, setor: string, incluir: string | null): Promise<Pessoa[]> {
  const prisma = getPrisma();
  const pessoas = await prisma.user.findMany({
    where: {
      tenantId,
      OR: [{ active: true, role: { not: "READONLY" }, sectors: { some: { sectorCode: setor } } }, ...(incluir ? [{ id: incluir }] : [])],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return pessoas.map((p) => ({ id: p.id, nome: p.name }));
}

export type Repositorio = {
  pastas: PastaDaArvore[];
  aberto: FluxoAberto | null;
  versaoAberta: VersaoAberta | null;
};

/**
 * As pastas do setor com os fluxos (só o título, para a árvore) e o fluxo
 * aberto inteiro. Só o aberto vem com a lista de etapas: um setor com
 * dezenas de fluxos não carrega todos a cada clique.
 */
export async function lerRepositorio(tenantId: string, setor: string, pedido: { fluxo?: string; versao?: string }): Promise<Repositorio> {
  const prisma = getPrisma();
  const pastas = await prisma.flowFolder.findMany({
    where: { tenantId, sectorCode: setor },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      icon: true,
      flows: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, version: true } },
    },
  });
  const arvore: PastaDaArvore[] = pastas.map((p) => ({ id: p.id, titulo: p.title, icone: p.icon, fluxos: p.flows.map((f) => ({ id: f.id, titulo: f.title, versao: f.version })) }));

  // O fluxo pedido no endereço, se é deste setor; senão o primeiro, como os manuais abrem a primeira página.
  const todos = arvore.flatMap((p) => p.fluxos);
  const escolhido = todos.find((f) => f.id === pedido.fluxo) ?? todos[0] ?? null;
  if (!escolhido) return { pastas: arvore, aberto: null, versaoAberta: null };

  const fluxo = await prisma.flowDoc.findFirst({
    where: { id: escolhido.id, tenantId },
    select: {
      id: true,
      folderId: true,
      title: true,
      ownerUserId: true,
      reviewedAt: true,
      version: true,
      methodology: true,
      steps: true,
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mime: true, size: true, createdAt: true, uploadedById: true } },
      versions: { orderBy: { version: "desc" }, take: 30, select: { version: true, savedAt: true, savedByName: true } },
    },
  });
  if (!fluxo) return { pastas: arvore, aberto: null, versaoAberta: null };

  const ids = [...new Set([fluxo.ownerUserId, ...fluxo.attachments.map((a) => a.uploadedById)].filter((x): x is string => !!x))];
  const nomes = new Map(
    ids.length > 0 ? (await prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []
  );

  const aberto: FluxoAberto = {
    id: fluxo.id,
    pastaId: fluxo.folderId,
    titulo: fluxo.title,
    donoId: fluxo.ownerUserId,
    donoNome: fluxo.ownerUserId ? (nomes.get(fluxo.ownerUserId) ?? null) : null,
    revisadoEm: dataDoBanco(fluxo.reviewedAt),
    versao: fluxo.version,
    metodologia: fluxo.methodology,
    etapas: lerListaDeEtapas(fluxo.steps) ?? [],
    anexos: fluxo.attachments.map((a) => ({
      id: a.id,
      nome: a.fileName,
      mime: a.mime,
      tamanho: a.size,
      previa: a.mime !== "application/vnd.jgraph.mxfile",
      enviadoEm: a.createdAt.toISOString(),
      enviadoPor: nomes.get(a.uploadedById) ?? null,
    })),
    versoes: fluxo.versions.map((v) => ({ versao: v.version, salvaEm: v.savedAt.toISOString(), salvaPor: v.savedByName })),
  };

  // "Ver esta versão": só uma versão anterior à atual.
  const numero = Number(pedido.versao);
  let versaoAberta: VersaoAberta | null = null;
  if (Number.isInteger(numero) && numero > 0 && numero < fluxo.version) {
    const v = await prisma.flowVersion.findUnique({ where: { flowDocId_version: { flowDocId: fluxo.id, version: numero } } });
    if (v) {
      versaoAberta = {
        versao: v.version,
        titulo: v.title,
        etapas: lerListaDeEtapas(v.steps) ?? [],
        metodologia: v.methodology,
        revisadoEm: dataDoBanco(v.reviewedAt),
        salvaEm: v.savedAt.toISOString(),
        salvaPor: v.savedByName,
      };
    }
  }
  return { pastas: arvore, aberto, versaoAberta };
}
