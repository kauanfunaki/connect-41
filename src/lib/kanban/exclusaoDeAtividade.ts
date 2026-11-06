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

import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { anotar, apagarArquivos, semArquivos } from "@/lib/exclusao/arquivos";

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

export type AtividadeApagada = { subatividades: number; anexos: number; arquivosQueFicaram: number };

/**
 * Apaga a atividade, as subatividades (pela cascata) e os anexos de todas.
 * `junto` roda na mesma transação, antes de apagar (a obrigação gerada, por
 * exemplo). Falha ao apagar um arquivo não desfaz nada: vai para o log.
 */
export async function apagarAtividadeComAnexos(
  tenantId: string,
  raizId: string,
  junto?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  db: Db = getPrisma(),
): Promise<AtividadeApagada> {
  const abaixo = await subarvoreDoItem(tenantId, raizId, db);
  const ids = [raizId, ...abaixo.map((s) => s.id)];
  const dosItens = { tenantId, entityType: "PIPELINE_ITEM" as const, entityId: { in: ids } };
  const urls = await db.$transaction(async (tx) => {
    const documentos = await tx.document.findMany({ where: dosItens, select: { fileUrl: true } });
    if (junto) await junto(tx);
    await tx.document.deleteMany({ where: dosItens });
    await tx.pipelineItem.delete({ where: { id: raizId } });
    return documentos.map((d) => d.fileUrl);
  });
  const arquivos = semArquivos();
  anotar(arquivos, "documents", urls);
  const arquivosQueFicaram = urls.length > 0 ? await apagarArquivos(arquivos) : 0;
  if (arquivosQueFicaram > 0) console.error(`[kanban:excluir] ${arquivosQueFicaram} anexo(s) da atividade ${raizId} ficaram no disco`);
  return { subatividades: abaixo.length, anexos: urls.length, arquivosQueFicaram };
}
