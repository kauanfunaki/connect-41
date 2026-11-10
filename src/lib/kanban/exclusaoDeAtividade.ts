// Excluir uma atividade com tudo o que ela leva (06/11/2026).
//
// A cascata do banco (`parentItemId` ON DELETE CASCADE) apaga as subatividades
// de todos os níveis, com o histórico e as horas de cada uma. Os anexos não:
// são `Document` com `entityType` PIPELINE_ITEM + `entityId`, sem chave
// estrangeira, e ficavam no banco e no disco sem nenhuma tela que chegasse
// neles. Aqui os documentos da árvore inteira saem na mesma transação que
// apaga a atividade, e os arquivos saem do disco DEPOIS do commit — a ordem da
// exclusão de cadastro (`src/lib/exclusao/arquivos.ts`): se o disco falhar,
// sobra um arquivo que ninguém vê, nunca uma linha apontando para o nada.
//
// A tarefa inteira (10/11/2026) passa pelo mesmo miolo, `apagarItensComAnexos`:
// os anexos de todos os itens dela na transação que apaga as atividades e a
// tarefa, e os arquivos depois do commit.

import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { anotar, apagarArquivos, semArquivos } from "@/lib/exclusao/arquivos";
import { contarArvoreDaTarefa, type ConteudoDaTarefa } from "@/lib/kanban/exclusaoDeTarefa";

// O MySQL para a cascata em 15 níveis encadeados; nada pela tela passa de
// PROFUNDIDADE_MAXIMA, e a volta é só a guarda contra dado montado à mão.
const NIVEIS_NA_LEITURA = 15;

type Db = Pick<ReturnType<typeof getPrisma>, "pipelineItem" | "document" | "$transaction">;

/**
 * Tudo o que fica abaixo do item, em todos os níveis, com a coluna de cada
 * um. Uma leitura por nível — no máximo PROFUNDIDADE_MAXIMA na prática.
 */
export async function subarvoreDoItem(tenantId: string, raizId: string, db: Pick<Db, "pipelineItem"> = getPrisma()): Promise<{ id: string; stageId: string }[]> {
  const out: { id: string; stageId: string }[] = [];
  const vistos = new Set([raizId]);
  let fronteira = [raizId];
  for (let nivel = 0; nivel < NIVEIS_NA_LEITURA && fronteira.length > 0; nivel++) {
    const filhas = await db.pipelineItem.findMany({
      where: { tenantId, parentItemId: { in: fronteira } },
      select: { id: true, stageId: true },
    });
    const novas = filhas.filter((f) => !vistos.has(f.id));
    for (const f of novas) vistos.add(f.id);
    out.push(...novas);
    fronteira = novas.map((f) => f.id);
  }
  return out;
}

type AnexosApagados = { anexos: number; arquivosQueFicaram: number };

/**
 * O miolo das exclusões: na mesma transação, os anexos (`Document` de
 * PIPELINE_ITEM) dos `ids` e o que `apagar` tira do banco; os arquivos saem do
 * disco só depois do commit. Se a transação cai, nenhum arquivo sai. Falha ao
 * apagar um arquivo não desfaz nada: vai para o log, com `rotulo`.
 */
async function apagarItensComAnexos(
  tenantId: string,
  ids: string[],
  apagar: (tx: Prisma.TransactionClient) => Promise<unknown>,
  rotulo: string,
  db: Db,
): Promise<AnexosApagados> {
  const dosItens = { tenantId, entityType: "PIPELINE_ITEM" as const, entityId: { in: ids } };
  const urls = await db.$transaction(async (tx) => {
    const documentos = ids.length > 0 ? await tx.document.findMany({ where: dosItens, select: { fileUrl: true } }) : [];
    if (ids.length > 0) await tx.document.deleteMany({ where: dosItens });
    await apagar(tx);
    return documentos.map((d) => d.fileUrl);
  });
  const arquivos = semArquivos();
  anotar(arquivos, "documents", urls);
  const arquivosQueFicaram = urls.length > 0 ? await apagarArquivos(arquivos) : 0;
  if (arquivosQueFicaram > 0) console.error(`[kanban:excluir] ${arquivosQueFicaram} anexo(s) ${rotulo} ficaram no disco`);
  return { anexos: urls.length, arquivosQueFicaram };
}

export type AtividadeApagada = { subatividades: number } & AnexosApagados;

/**
 * Apaga a atividade, as subatividades (pela cascata) e os anexos de todas.
 * `junto` roda na mesma transação, antes de apagar a atividade (a obrigação
 * gerada, por exemplo).
 */
export async function apagarAtividadeComAnexos(
  tenantId: string,
  raizId: string,
  junto?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  db: Db = getPrisma(),
): Promise<AtividadeApagada> {
  const abaixo = await subarvoreDoItem(tenantId, raizId, db);
  const ids = [raizId, ...abaixo.map((s) => s.id)];
  const r = await apagarItensComAnexos(
    tenantId,
    ids,
    async (tx) => {
      if (junto) await junto(tx);
      await tx.pipelineItem.delete({ where: { id: raizId } });
    },
    `da atividade ${raizId}`,
    db,
  );
  return { subatividades: abaixo.length, ...r };
}

export type TarefaApagada = ConteudoDaTarefa & AnexosApagados;

/**
 * Apaga a tarefa (a `Pipeline`) com as atividades e as subatividades de todos
 * os níveis, os comentários, o histórico, as horas e os anexos de todas
 * (10/11/2026). Quem chama já conferiu permissão e os bloqueios (obrigações e
 * assuntos de solicitação que apontam para a tarefa).
 *
 * As atividades de cima saem pelo id, e a cascata do `parentItemId` leva as
 * subatividades — a mesma da exclusão de uma atividade. As colunas são
 * cascata da própria tarefa. Uma atividade criada no meio do caminho fica
 * fora da lista de ids: o banco recusa apagar a tarefa com ela, e a
 * transação inteira volta.
 */
export async function apagarTarefaComAtividades(tenantId: string, pipelineId: string, db: Db = getPrisma()): Promise<TarefaApagada> {
  const itens = await db.pipelineItem.findMany({ where: { tenantId, pipelineId }, select: { id: true, parentItemId: true } });
  const deCima = itens.filter((i) => i.parentItemId === null).map((i) => i.id);
  const r = await apagarItensComAnexos(
    tenantId,
    itens.map((i) => i.id),
    async (tx) => {
      if (deCima.length > 0) await tx.pipelineItem.deleteMany({ where: { tenantId, id: { in: deCima } } });
      await tx.pipeline.delete({ where: { id: pipelineId } });
    },
    `da tarefa ${pipelineId}`,
    db,
  );
  return { ...contarArvoreDaTarefa(itens), ...r };
}
