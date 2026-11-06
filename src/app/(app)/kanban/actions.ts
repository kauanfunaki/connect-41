"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PipelineEntityType, ActivityType, RecurringFrequency, StageType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, podeExcluir, SO_ADMIN_EXCLUI } from "@/lib/auth/context";
import { poderesNoEspaco } from "@/lib/kanban/permissaoDoEspaco";
import { recusaDoLancamentoAtrasado } from "@/lib/horas/regras";
import { saoPauloParts } from "@/lib/agenda";
// O que cada um faz numa lista vem da permissão do espaço dela (05/11/2026):
// `editar` cria e edita, `comentar` comenta. Ver `permissaoDoEspaco.ts`.
import { poderesNaLista } from "@/lib/kanban/permissaoDoEspacoServidor";
import { accessiblePipelineWhere } from "@/lib/auth/scope";
import { boardPath } from "@/lib/kanbanPaths";
import { minutosApontados, segundosDesde } from "@/lib/datetime";
import { duracaoDoLancamento, lerLancamentoDeHoras, type EstadoDaEdicaoDeHoras } from "@/lib/horas/edicao";
import { findMentionedUserIds } from "@/lib/handoffMentions";
import { notifyUser } from "@/lib/notifications";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";
import { normalizeAccentColor } from "@/lib/color";
import { logAudit } from "@/lib/audit";
import { AVISO_DO_LIMITE, PROFUNDIDADE_MAXIMA, aceitaSubatividade, montarArvore, porOrdem, reposicionar, type NoDaArvore } from "@/lib/kanban/subatividades";

export type PipelineState = { error: string } | null;

// ─── A árvore de subatividades (06/11/2026) ─────────────────────────────────
// Ver `src/lib/kanban/subatividades.ts`: a regra e o limite moram lá.

// O MySQL para a cascata em 15 níveis encadeados; nada pela tela passa de
// PROFUNDIDADE_MAXIMA, e a volta é só a guarda contra dado montado à mão.
const NIVEIS_NA_LEITURA = 15;

/**
 * Tudo o que fica abaixo do item, em todos os níveis, com a coluna de cada
 * um. Uma leitura por nível — no máximo PROFUNDIDADE_MAXIMA na prática.
 */
async function subarvoreDoItem(tenantId: string, raizId: string): Promise<{ id: string; stageId: string }[]> {
  const prisma = getPrisma();
  const out: { id: string; stageId: string }[] = [];
  const vistos = new Set([raizId]);
  let fronteira = [raizId];
  for (let nivel = 0; nivel < NIVEIS_NA_LEITURA && fronteira.length > 0; nivel++) {
    const filhas = await prisma.pipelineItem.findMany({
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

/** A profundidade do item pelo pai dele (0 = a atividade, sem pai), subindo nível a nível. */
async function profundidadePeloPai(tenantId: string, parentItemId: string | null): Promise<number> {
  const prisma = getPrisma();
  const vistos = new Set<string>();
  let profundidade = 0;
  let pai = parentItemId;
  while (pai && !vistos.has(pai) && profundidade <= PROFUNDIDADE_MAXIMA) {
    vistos.add(pai);
    profundidade++;
    const acima = await prisma.pipelineItem.findFirst({ where: { id: pai, tenantId }, select: { parentItemId: true } });
    pai = acima?.parentItemId ?? null;
  }
  return profundidade;
}

/** "1 subatividade" / "3 subatividades", para o histórico e a auditoria. */
function quantasSubatividades(n: number): string {
  return n === 1 ? "1 subatividade" : `${n} subatividades`;
}

// Destinatários "de interesse" de um item — responsáveis + participantes
// (watchers). Usado pra notificar quem acompanha a tarefa quando entra um
// comentário novo, sem incluir o próprio autor da ação.
async function interestedUserIds(pipelineItemId: string, excludeUserId: string): Promise<string[]> {
  const prisma = getPrisma();
  const [assignees, watchers] = await Promise.all([
    prisma.pipelineItemAssignee.findMany({ where: { pipelineItemId }, select: { userId: true } }),
    prisma.pipelineItemWatcher.findMany({ where: { pipelineItemId }, select: { userId: true } }),
  ]);
  const ids = new Set<string>();
  for (const a of assignees) ids.add(a.userId);
  for (const w of watchers) ids.add(w.userId);
  ids.delete(excludeUserId);
  return [...ids];
}

/**
 * Revalida o detalhe de um item nos DOIS lugares em que ele aparece.
 *
 * O detalhe abre como rota cheia (`/kanban/[id]/itens/[itemId]`) e como modal
 * por rota interceptada (`/kanban/[id]/@modal/(.)itens/[itemId]`), que é um
 * slot paralelo de `/kanban/[id]`. Revalidar só a rota cheia deixava o modal
 * com dado velho: parar o cronômetro gravava o apontamento no banco e a seção
 * de Tempo não recarregava, dando a impressão de que nada tinha sido
 * registrado. Achado na conferência visual de 09/09.
 *
 * Não é exportada de propósito: num arquivo "use server" só valem exports
 * assíncronos, e esta é síncrona.
 *
 * A primeira linha era `revalidatePath` da rota cheia; a troca em massa de
 * 09/09 que criou esta função trocou também essa linha, e a função passou a
 * chamar a si mesma — toda ação do cartão (comentar, mover, anexar, apontar
 * tempo…) caía em "Maximum call stack size exceeded". Achado em 06/10, na
 * gravação dos vídeos da ajuda.
 */
function revalidarItem(pipeline: { id: string }, itemId: string) {
  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
  revalidatePath(boardPath(pipeline));
}

// Marcar responsável/participante só com gente do escritório: o id vinha da
// tela e entrava sem conferência (achado na revisão das exclusões, 13/10/2026).
async function usuarioDoEscritorio(tenantId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const u = await getPrisma().user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  return u !== null;
}

export async function criarPipeline(
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  const sectorCode = (form.get("sectorCode") as string)?.trim();
  const entityType = form.get("entityType") as PipelineEntityType;

  if (!name) return { error: "Nome da tarefa é obrigatório" };
  if (!sectorCode) return { error: "Setor é obrigatório" };

  const prisma = getPrisma();
  // Toda Lista precisa de um Espaço (estrutura Espaço → Pasta → Lista) — o
  // formulário genérico de criação de kanban ainda não pede espaço
  // explicitamente, então reaproveita/cria um espaço padrão (nome = code do
  // setor) pra não travar esse fluxo enquanto a navegação por Espaço não
  // chega nos demais setores. Com o espaço, vale a permissão dele (05/11/2026);
  // sem, criá-lo é de quem coordena o setor.
  const espacoPadrao = await prisma.space.findFirst({ where: { tenantId, sectorCode, name: sectorCode } });
  const pode = espacoPadrao ? poderesNoEspaco(ctx, espacoPadrao).editar : canManageSector(ctx, sectorCode);
  if (!pode) return { error: "Sem permissão para criar tarefa neste setor." };

  const stageNames = form.getAll("stageName") as string[];
  const stageColors = form.getAll("stageColor") as string[];
  const stages = stageNames
    .map((n, i) => ({ name: n.trim(), color: stageColors[i] ? normalizeAccentColor(stageColors[i]) : null }))
    .filter((s) => s.name);

  if (stages.length === 0) return { error: "Adicione ao menos um estágio" };

  let id: string;

  try {
    const space = espacoPadrao ?? (await prisma.space.create({ data: { tenantId, sectorCode, name: sectorCode } }));

    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        name,
        sectorCode,
        spaceId: space.id,
        entityType,
        stages: {
          create: stages.map((s, i) => ({
            name: s.name,
            color: s.color,
            order: i,
            isTerminal: i === stages.length - 1,
            type: i === stages.length - 1 ? StageType.DONE : StageType.NOT_STARTED,
          })),
        },
      },
    });
    id = pipeline.id;
  } catch (err) {
    console.error("[criarPipeline]", err);
    return { error: "Erro ao criar a tarefa. Tente novamente." };
  }

  redirect(boardPath({ id }));
}

export async function criarItem(
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const pipelineId = form.get("pipelineId") as string;
  const entityType = (form.get("entityType") as string)?.trim() || null;
  const entityId = (form.get("entityId") as string)?.trim() || null;
  const title = (form.get("title") as string)?.trim() || null;
  const dueDateRaw = (form.get("dueDate") as string)?.trim();
  const priorityRaw = (form.get("priority") as string)?.trim();
  const descriptionRaw = (form.get("description") as string)?.trim();

  // Empresa/pessoa é opcional (nem toda tarefa está associada a uma) — mas
  // sem entidade, o título vira obrigatório (é o que identifica a tarefa).
  if (!entityId && !title) return { error: "Selecione uma empresa/pessoa ou informe um título" };

  const tagIds = form.getAll("tags") as string[];
  const assigneeIds = form.getAll("assignees") as string[];

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, ...accessiblePipelineWhere(ctx) } });
  if (!pipeline) return { error: "Tarefa não encontrada ou fora do seu escopo." };
  if (!(await poderesNaLista(ctx, pipeline)).editar) {
    return { error: "Sem permissão para adicionar atividades neste setor." };
  }

  try {
    const selectedStageId = (form.get("stageId") as string | null)?.trim();
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId, ...(selectedStageId ? { id: selectedStageId } : {}) },
      orderBy: { order: "asc" },
    });
    if (!firstStage) return { error: "Estágio inválido ou tarefa sem estágios configurados" };

    const item = await prisma.pipelineItem.create({
      data: {
        tenantId,
        pipelineId,
        stageId: firstStage.id,
        entityType: entityType as PipelineEntityType | null,
        entityId,
        title,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        priority: priorityRaw ? parseInt(priorityRaw) : 0,
        description: descriptionRaw ? descriptionRaw : null,
        tags: tagIds.length > 0 ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        assignees: assigneeIds.length > 0 ? { create: assigneeIds.map((userId) => ({ userId })) } : undefined,
      },
    });

    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: item.id, userId, type: ActivityType.CREATED, content: `Criado em "${firstStage.name}"` },
      });
    }
  } catch (err) {
    console.error("[criarItem]", err);
    return { error: "Erro ao adicionar item. Tente novamente." };
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  redirect(base);
}

// Criação rápida — só o título, sem entidade/prazo/prioridade/responsável.
// Usada pelo botão "Adicionar tarefa" da visão em lista; o resto se
// configura depois no detalhe da tarefa.
export async function criarTarefaRapida(pipelineId: string, stageId: string, title: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const trimmed = title.trim();
  if (!tenantId || !trimmed) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, ...accessiblePipelineWhere(ctx) } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
  if (!stage) return;

  try {
    const item = await prisma.pipelineItem.create({
      data: { tenantId, pipelineId, stageId, title: trimmed },
    });
    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: item.id, userId, type: ActivityType.CREATED, content: `Criado em "${stage.name}"` },
      });
    }
  } catch (err) {
    console.error("[criarTarefaRapida]", err);
    return;
  }

  revalidatePath(boardPath(pipeline));
}

// Renomear estágio direto na visão em lista (clique no cabeçalho do status).
export async function renomearEstagio(pipelineId: string, stageId: string, name: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  const trimmed = name.trim();
  if (!tenantId || !trimmed) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  try {
    await prisma.pipelineStage.update({ where: { id: stageId, pipelineId }, data: { name: trimmed } });
  } catch (err) {
    console.error("[renomearEstagio]", err);
    return;
  }

  revalidatePath(boardPath(pipeline));
}

export type StageInput = { id?: string; name: string; color: string; type: StageType };
export type EditStagesState = { error: string } | null;

// CRUD completo de estágios de uma lista (editar nome/cor/tipo, criar, excluir,
// reordenar), usado pelo modal "Editar lista". Recebe a lista final desejada
// de estágios (com id pros existentes, sem id pros novos) e reconcilia com o
// banco numa transação — reorder em duas fases (temp negativo -> final) pra
// não colidir com a constraint única (pipelineId, order).
export async function atualizarEstagios(pipelineId: string, stages: StageInput[]): Promise<EditStagesState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  // A cor passa pela guarda de contraste aqui, não só no modal: o modal corrige
  // enquanto o usuário escolhe, mas a action é o que de fato grava — e ela
  // também atende o board, onde a cor pode chegar por outro caminho.
  const cleaned = stages
    .map((s) => ({ ...s, name: s.name.trim(), color: normalizeAccentColor(s.color) }))
    .filter((s) => s.name);
  if (cleaned.length === 0) return { error: "Adicione ao menos um estágio" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return { error: "Tarefa não encontrada." };
  if (!(await poderesNaLista(ctx, pipeline)).editar) {
    return { error: "Sem permissão para editar esta tarefa." };
  }

  const existing = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    include: { _count: { select: { items: true } } },
  });

  const keptIds = new Set(cleaned.map((s) => s.id).filter((id): id is string => !!id));
  const removed = existing.filter((s) => !keptIds.has(s.id));
  // Tirar coluna é excluir: só o administrador (13/10/2026). O gestor do setor
  // segue renomeando, recolorindo, reordenando e criando colunas.
  if (removed.length > 0 && !podeExcluir(ctx)) {
    return { error: `${SO_ADMIN_EXCLUI} Peça a ele para tirar a coluna "${removed[0].name}".` };
  }
  const removedWithItems = removed.filter((s) => s._count.items > 0);
  if (removedWithItems.length > 0) {
    return { error: `Mova as atividades de "${removedWithItems[0].name}" antes de excluir esse estágio.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const s of removed) {
        await tx.pipelineStage.delete({ where: { id: s.id } });
      }
      // Fase 1: joga todo mundo pra uma faixa negativa temporária, pra não
      // colidir com @@unique([pipelineId, order]) ao trocar posições.
      await tx.pipelineStage.updateMany({
        where: { pipelineId, id: { in: [...keptIds] } },
        data: { order: { decrement: 100000 } },
      });
      for (let i = 0; i < cleaned.length; i++) {
        const s = cleaned[i];
        const isTerminal = s.type === StageType.DONE;
        if (s.id) {
          await tx.pipelineStage.update({
            where: { id: s.id, pipelineId },
            data: { name: s.name, color: s.color, type: s.type, isTerminal, order: i },
          });
        } else {
          await tx.pipelineStage.create({
            data: { pipelineId, name: s.name, color: s.color, type: s.type, isTerminal, order: i },
          });
        }
      }
    });
  } catch (err) {
    console.error("[atualizarEstagios]", err);
    return { error: "Erro ao salvar a tarefa. Tente novamente." };
  }

  revalidatePath(boardPath(pipeline));
  return null;
}

// Devolve `{ error }` quando não move (auditoria de UX, 30/10/2026): o quadro
// põe o cartão na coluna nova na hora e precisa saber quando devolvê-lo e
// avisar — antes a recusa e a falha eram silenciosas.
export async function moverItem(
  itemId: string,
  newStageId: string
): Promise<{ error: string } | void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Sua sessão expirou. Entre de novo para mover a tarefa." };

  const prisma = getPrisma();

  try {
    const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return { error: "Esta tarefa não existe mais." };
    if (item.stageId === newStageId) return; // reordenar dentro da mesma coluna — sem mudança de estágio, não registra atividade

    const pipeline = await prisma.pipeline.findFirst({ where: { id: item.pipelineId } });
    if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return { error: "Você não pode mover tarefas deste quadro." };

    const [fromStage, toStage] = await Promise.all([
      prisma.pipelineStage.findUnique({ where: { id: item.stageId } }),
      prisma.pipelineStage.findUnique({ where: { id: newStageId } }),
    ]);

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { stageId: newStageId },
    });

    await prisma.activity.create({
      data: {
        tenantId,
        pipelineItemId: itemId,
        userId,
        type: ActivityType.STATUS_CHANGE,
        content: `Movido de "${fromStage?.name ?? "?"}" para "${toStage?.name ?? "?"}"`,
        metadata: { stageFrom: fromStage?.id, stageTo: toStage?.id },
      },
    });

    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  } catch (err) {
    console.error("[moverItem]", err);
    return { error: "Não foi possível mover a tarefa. Tente de novo." };
  }
}

// Soltar uma atividade em cima de outra (06/11/2026): ela vai para o lugar da
// outra e as do meio andam uma casa. Irmãs são as do mesmo pai — na atividade
// de cima, também da mesma coluna (a lista agrupa por coluna); na
// subatividade, de qualquer coluna, porque a lista as mostra juntas embaixo
// do pai. Mudar de pai pelo arraste não existe: de pais diferentes, recusa.
//
// Era `reordenarItem`, que trocava vizinhas uma a uma (um clique do servidor
// por casa) e não andava quando as duas tinham a mesma `order` — o caso de
// toda atividade criada pelo "Adicionar atividade", que nasce com 0. Agora as
// irmãs são renumeradas de 0 em diante numa transação só.
export async function reposicionarItem(itemId: string, alvoId: string): Promise<{ error: string } | void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Sua sessão expirou. Entre de novo para mudar a ordem." };

  const prisma = getPrisma();

  try {
    const [item, alvo] = await Promise.all([
      prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } }),
      prisma.pipelineItem.findFirst({ where: { id: alvoId, tenantId } }),
    ]);
    if (!item || !alvo) return { error: "Esta atividade não existe mais." };
    if (item.pipelineId !== alvo.pipelineId || item.parentItemId !== alvo.parentItemId) {
      return { error: "Arrastando, a atividade muda de lugar só entre as do mesmo nível." };
    }
    if (item.parentItemId === null && item.stageId !== alvo.stageId) return;

    const pipeline = await prisma.pipeline.findFirst({ where: { id: item.pipelineId } });
    if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return { error: "Você não pode mudar a ordem desta lista." };

    const irmas = await prisma.pipelineItem.findMany({
      where: {
        tenantId,
        pipelineId: item.pipelineId,
        parentItemId: item.parentItemId,
        ...(item.parentItemId === null ? { stageId: item.stageId } : {}),
      },
      select: { id: true, order: true, createdAt: true },
    });
    const nova = reposicionar(irmas.sort(porOrdem).map((i) => i.id), itemId, alvoId);
    if (!nova) return;

    await prisma.$transaction(nova.map((id, order) => prisma.pipelineItem.update({ where: { id }, data: { order } })));

    revalidatePath(boardPath(pipeline));
  } catch (err) {
    console.error("[reposicionarItem]", err);
    return { error: "Não foi possível mudar a ordem. Tente de novo." };
  }
}

export async function adicionarNota(
  pipelineId: string,
  itemId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };

  const content = (form.get("content") as string)?.trim();
  if (!content) return { error: "Escreva uma nota" };

  // parentActivityId opcional — presente quando a nota é resposta a outra.
  const parentActivityId = (form.get("parentActivityId") as string)?.trim() || null;

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).comentar) {
    return { error: "Sem permissão para comentar nesta lista." };
  }

  // Resposta só é válida se apontar pra um comentário (NOTE) do mesmo item.
  let validParentId: string | null = null;
  if (parentActivityId) {
    const parent = await prisma.activity.findFirst({
      where: { id: parentActivityId, pipelineItemId: itemId, tenantId, type: ActivityType.NOTE },
      select: { id: true },
    });
    validParentId = parent?.id ?? null;
  }

  const item = await prisma.pipelineItem.findFirst({
    where: { id: itemId, tenantId },
    select: { entityType: true, entityId: true, title: true },
  });

  try {
    await prisma.activity.create({
      data: {
        tenantId,
        pipelineItemId: itemId,
        userId,
        type: ActivityType.NOTE,
        content,
        parentActivityId: validParentId,
      },
    });
  } catch (err) {
    console.error("[adicionarNota]", err);
    return { error: "Erro ao adicionar nota." };
  }

  // Notificações: mencionados (@Nome) + interessados (responsáveis/participantes),
  // sem duplicar e sem notificar o próprio autor. Menção é o sinal mais forte,
  // então tem prioridade quando o usuário é mencionado E interessado.
  if (item) {
    // A notificação leva ao card, e não à empresa ou pessoa ligada a ele: o
    // comentário está no card, e card solto não levava a lugar nenhum. Leva
    // também quem comentou, para a foto no sino (05/10/2026).
    const notifyEntity = { entityId: itemId, actorUserId: userId };
    const taskLabel = item.title ?? "atividade";
    const mentioned = await findMentionedUserIds(tenantId, [content]);
    const mentionedSet = new Set(mentioned);
    mentionedSet.delete(userId);

    for (const uid of mentionedSet) {
      await notifyUser(uid, {
        tenantId, type: "MENTION", message: `Você foi mencionado em um comentário (${taskLabel}).`, ...notifyEntity,
      });
    }

    const interested = await interestedUserIds(itemId, userId);
    for (const uid of interested) {
      if (mentionedSet.has(uid)) continue; // já notificado pela menção
      await notifyUser(uid, {
        tenantId, type: "COMMENT", message: `Novo comentário em ${taskLabel}.`, ...notifyEntity,
      });
    }
  }

  revalidarItem(pipeline, itemId);
  return null;
}

export async function editarNota(pipelineId: string, itemId: string, activityId: string, content: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId || !content.trim()) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return;

  // Só o próprio autor edita a própria nota (independe de canManage).
  const note = await prisma.activity.findFirst({
    where: { id: activityId, pipelineItemId: itemId, tenantId, type: ActivityType.NOTE },
    select: { userId: true },
  });
  if (!note || note.userId !== userId) return;

  try {
    await prisma.activity.update({ where: { id: activityId }, data: { content: content.trim(), editedAt: new Date() } });
  } catch (err) {
    console.error("[editarNota]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

export async function excluirNota(pipelineId: string, itemId: string, activityId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return;

  const note = await prisma.activity.findFirst({
    where: { id: activityId, pipelineItemId: itemId, tenantId, type: ActivityType.NOTE },
    select: { userId: true },
  });
  // Excluir comentário é só do administrador (13/10/2026) — o autor corrige o
  // que escreveu pelo "Editar". Antes o autor e o coordenador excluíam.
  if (!note || !podeExcluir(ctx)) return;

  try {
    await prisma.activity.delete({ where: { id: activityId } });
  } catch (err) {
    console.error("[excluirNota]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

export async function alternarObservadorItem(pipelineId: string, itemId: string, userId: string, marcado: boolean): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).comentar) return;

  // Mesmo fix de alternarTagItem/alternarResponsavelItem.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;
  // Desmarcar participante segue livre para quem age no setor (exceção do dia
  // a dia, 13/10/2026); marcar só aceita pessoa deste escritório.
  if (marcado && !(await usuarioDoEscritorio(tenantId, userId))) return;

  try {
    if (marcado) {
      await prisma.pipelineItemWatcher.upsert({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
        create: { pipelineItemId: itemId, userId },
        update: {},
      });
    } else {
      await prisma.pipelineItemWatcher.delete({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
      });
    }
  } catch (err) {
    console.error("[alternarObservadorItem]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

// Para o histórico do cartão: 0 é "sem prioridade" desde 05/11/2026 (era "Normal").
const PRIORITY_LABEL: Record<number, string> = { 0: "Sem prioridade", 1: "Alta", 2: "Urgente" };

function formatDueDateLabel(d: Date | null): string {
  if (!d) return "sem prazo";
  return d.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export async function atualizarPrazoPrioridade(
  pipelineId: string,
  itemId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) {
    return { error: "Sem permissão para editar este item." };
  }

  const dueDateRaw = (form.get("dueDate") as string)?.trim();
  const startDateRaw = (form.get("startDate") as string)?.trim();
  const priorityRaw = (form.get("priority") as string)?.trim();
  const recurring = form.get("recurring") === "true";
  const frequencyRaw = (form.get("recurrenceFrequency") as string)?.trim();
  const newDueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const newStartDate = startDateRaw ? new Date(startDateRaw) : null;
  const newPriority = priorityRaw ? parseInt(priorityRaw) : 0;
  const newFrequency: RecurringFrequency | null =
    recurring && ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"].includes(frequencyRaw) ? (frequencyRaw as RecurringFrequency) : null;

  try {
    // findFirst com tenantId+pipelineId (não findUnique só por id) — sem isso,
    // um itemId de OUTRO tenant passava a validação (que só checava o
    // pipelineId do chamador) e tinha seu prazo/prioridade sobrescritos.
    const before = await prisma.pipelineItem.findFirst({
      where: { id: itemId, tenantId, pipelineId },
      select: { dueDate: true, priority: true },
    });
    if (!before) return { error: "Atividade não encontrada." };

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: {
        dueDate: newDueDate,
        startDate: newStartDate,
        priority: newPriority,
        recurring,
        recurrenceFrequency: newFrequency,
      },
    });

    if (userId && before) {
      const beforeDue = before.dueDate ? before.dueDate.getTime() : null;
      const afterDue = newDueDate ? newDueDate.getTime() : null;
      if (beforeDue !== afterDue) {
        await prisma.activity.create({
          data: {
            tenantId, pipelineItemId: itemId, userId, type: ActivityType.DUE_DATE_CHANGE,
            content: `Prazo alterado de ${formatDueDateLabel(before.dueDate)} para ${formatDueDateLabel(newDueDate)}`,
          },
        });
      }
      if (before.priority !== newPriority) {
        await prisma.activity.create({
          data: {
            tenantId, pipelineItemId: itemId, userId, type: ActivityType.PRIORITY_CHANGE,
            content: `Prioridade alterada de "${PRIORITY_LABEL[before.priority] ?? before.priority}" para "${PRIORITY_LABEL[newPriority] ?? newPriority}"`,
          },
        });
      }
    }
  } catch (err) {
    console.error("[atualizarPrazoPrioridade]", err);
    return { error: "Erro ao atualizar prazo/prioridade." };
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
  return null;
}

export async function atualizarDescricao(
  pipelineId: string,
  itemId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) {
    return { error: "Sem permissão para editar este item." };
  }

  const raw = (form.get("description") as string)?.trim() ?? "";
  const sanitized = raw ? sanitizeDocumentHtml(raw) : "";
  // Editor rich text vazio ainda manda marcação tipo "<p></p>" — trata como vazio de verdade.
  const description = sanitized.replace(/<[^>]+>/g, "").trim() ? sanitized : "";

  try {
    // findFirst com tenantId+pipelineId — mesmo fix de atualizarPrazoPrioridade
    // (findUnique só por id deixava sobrescrever descrição de item de outro tenant).
    const before = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { description: true } });
    if (!before) return { error: "Atividade não encontrada." };

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { description: description ? description : null },
    });

    if (userId && before && (before.description ?? "") !== (description || "")) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.DESCRIPTION_CHANGE, content: "Descrição atualizada" },
      });
    }
  } catch (err) {
    console.error("[atualizarDescricao]", err);
    return { error: "Erro ao atualizar descrição." };
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
  return null;
}

export async function alternarTagItem(
  pipelineId: string,
  itemId: string,
  tagId: string,
  marcado: boolean
): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  // Sem isso, um itemId de outro tenant/pipeline passava (só o pipelineId do
  // chamador era checado acima) e ganhava/perdia tag de fora do escopo dele.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;
  // Desmarcar tag segue livre para quem age no setor (exceção do dia a dia,
  // 13/10/2026). Marcar só aceita tag deste escritório: o tagId vinha da tela
  // sem conferência.
  if (marcado && !(await prisma.tag.findFirst({ where: { id: tagId, tenantId }, select: { id: true } }))) return;

  try {
    if (marcado) {
      await prisma.pipelineItemTag.upsert({
        where: { pipelineItemId_tagId: { pipelineItemId: itemId, tagId } },
        create: { pipelineItemId: itemId, tagId },
        update: {},
      });
    } else {
      await prisma.pipelineItemTag.delete({
        where: { pipelineItemId_tagId: { pipelineItemId: itemId, tagId } },
      });
    }

    if (userId) {
      const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { name: true } });
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId: itemId, userId, type: ActivityType.TAG_CHANGE,
          content: `Tag "${tag?.name ?? "?"}" ${marcado ? "adicionada" : "removida"}`,
        },
      });
    }
  } catch (err) {
    console.error("[alternarTagItem]", err);
    return;
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
}

export async function alternarResponsavelItem(
  pipelineId: string,
  itemId: string,
  userId: string,
  marcado: boolean
): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId: actorId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  // Mesmo fix de alternarTagItem — valida que itemId é mesmo desse pipeline/tenant.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;
  // Desmarcar responsável segue livre (exceção do dia a dia); marcar só aceita
  // pessoa deste escritório.
  if (marcado && !(await usuarioDoEscritorio(tenantId, userId))) return;

  try {
    if (marcado) {
      await prisma.pipelineItemAssignee.upsert({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
        create: { pipelineItemId: itemId, userId },
        update: {},
      });
    } else {
      await prisma.pipelineItemAssignee.delete({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
      });
    }

    if (actorId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId: itemId, userId: actorId, type: ActivityType.ASSIGNEE_CHANGE,
          content: `${user?.name ?? "?"} ${marcado ? "adicionado" : "removido"} como responsável`,
        },
      });
    }
  } catch (err) {
    console.error("[alternarResponsavelItem]", err);
    return;
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
}

// Prioridade específica de um responsável nessa tarefa (pode divergir da
// prioridade geral do item) — usado no seletor por avatar da visão em lista.
export async function atualizarPrioridadeResponsavel(pipelineId: string, itemId: string, userId: string, priority: number): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  // Mesmo fix de alternarTagItem — sem isso dava pra reescrever a prioridade
  // de um responsável em item de outro tenant/pipeline.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;

  try {
    await prisma.pipelineItemAssignee.update({
      where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
      data: { priority },
    });
  } catch (err) {
    console.error("[atualizarPrioridadeResponsavel]", err);
    return;
  }

  revalidatePath(boardPath(pipeline));
}

// ─── Cronômetro ao vivo ─────────────────────────────────────────────────────
// Só 1 pessoa rastreando por vez num item — iniciar quando já há um cronômetro
// ativo (de outra pessoa) simplesmente não faz nada (UI já esconde esse caso).

export async function iniciarCronometro(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  try {
    const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId }, select: { activeTimerUserId: true } });
    if (!item || item.activeTimerUserId) return; // já tem alguém rastreando

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { activeTimerUserId: userId, activeTimerStartedAt: new Date() },
    });
  } catch (err) {
    console.error("[iniciarCronometro]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

export async function pararCronometro(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  try {
    const item = await prisma.pipelineItem.findFirst({
      where: { id: itemId, tenantId },
      select: { activeTimerUserId: true, activeTimerStartedAt: true },
    });
    if (!item || item.activeTimerUserId !== userId || !item.activeTimerStartedAt) return;

    // Mesma função que a tela usa para mostrar o apontamento antes de parar —
    // se as duas divergirem, o contador volta a prometer o que não cumpre.
    const minutes = minutosApontados(segundosDesde(item.activeTimerStartedAt.toISOString()));
    await prisma.$transaction([
      prisma.pipelineItem.update({ where: { id: itemId }, data: { activeTimerUserId: null, activeTimerStartedAt: null } }),
      prisma.timeEntry.create({ data: { tenantId, pipelineItemId: itemId, userId, minutes, loggedOn: new Date(), source: "CRONOMETRO" } }),
    ]);
    await prisma.activity.create({
      data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.TIME_LOGGED, content: `${minutes} min apontados (cronômetro)` },
    });
  } catch (err) {
    console.error("[pararCronometro]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

// ─── Vincular itens / dependências ─────────────────────────────────────────

export async function criarLinkItem(pipelineId: string, itemId: string, linkedItemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId || itemId === linkedItemId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  // itemId (origem) também precisa ser validado — só o linkedItemId (alvo) era
  // checado, então dava pra criar um PipelineItemLink apontando pra um item de
  // outro tenant como "origem" (poluição cross-tenant do vínculo).
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;

  const linked = await prisma.pipelineItem.findFirst({ where: { id: linkedItemId, tenantId } });
  if (!linked) return;

  try {
    await prisma.pipelineItemLink.upsert({
      where: { pipelineItemId_linkedItemId: { pipelineItemId: itemId, linkedItemId } },
      create: { tenantId, pipelineItemId: itemId, linkedItemId },
      update: {},
    });
  } catch (err) {
    console.error("[criarLinkItem]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

export async function removerLinkItem(pipelineId: string, itemId: string, linkedItemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;
  // Desvincular segue com quem age no setor (exceção do dia a dia, 13/10/2026),
  // mas o card tem de ser desta lista: só o pipelineId era conferido, e quem
  // agia num setor desfazia vínculo de card de outro.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;

  try {
    // O vínculo pode ter sido criado em qualquer direção (itemId como origem
    // ou como alvo) — remove o registro nos dois sentidos possíveis.
    await prisma.pipelineItemLink.deleteMany({
      where: {
        tenantId,
        OR: [
          { pipelineItemId: itemId, linkedItemId },
          { pipelineItemId: linkedItemId, linkedItemId: itemId },
        ],
      },
    });
  } catch (err) {
    console.error("[removerLinkItem]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

export async function excluirItem(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  // Excluir card: só o administrador (13/10/2026). Era o gestor do setor.
  if (!tenantId || !podeExcluir(ctx)) return;

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canManageSector(ctx, pipeline.sectorCode)) return;

  // O card tem de ser desta lista — o pipelineId que libera a ação é o dela.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId } });
  if (!item) return;

  try {
    await excluirComSubatividades(ctx, item);
  } catch (err) {
    console.error("[excluirItem]", err);
    return;
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  redirect(base);
}

/**
 * Exclui o item — as subatividades de todos os níveis vão junto, pela cascata
 * do banco (`parentItemId` ON DELETE CASCADE), com o histórico, os anexos e as
 * horas de cada uma. A tela pergunta antes, dizendo quantas são.
 *
 * O histórico de quem foi apagado vai junto com ele, então o rastro fica em
 * dois lugares (06/11/2026): no histórico do pai, quando o apagado era
 * subatividade, e na Auditoria, com quantas subatividades foram junto.
 */
async function excluirComSubatividades(
  ctx: { tenantId: string; userId: string | null },
  item: { id: string; title: string | null; parentItemId: string | null },
): Promise<void> {
  const prisma = getPrisma();
  const abaixo = (await subarvoreDoItem(ctx.tenantId, item.id)).length;
  const titulo = item.title ?? "(sem título)";

  await prisma.pipelineItem.delete({ where: { id: item.id } });

  if (ctx.userId && item.parentItemId) {
    await prisma.activity.create({
      data: {
        tenantId: ctx.tenantId,
        pipelineItemId: item.parentItemId,
        userId: ctx.userId,
        type: ActivityType.SUBTASK_CHANGE,
        content: abaixo > 0
          ? `Subatividade "${titulo}" removida, com ${quantasSubatividades(abaixo)} dentro dela`
          : `Subatividade "${titulo}" removida`,
      },
    });
  }
  if (ctx.userId) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "kanban.atividade.excluir",
      entityType: "PipelineItem",
      entityId: item.id,
      metadata: { title: titulo, subatividades: abaixo, ...(item.parentItemId ? { pai: item.parentItemId } : {}) },
    });
  }
}

// ─── Subtarefas ────────────────────────────────────────────────────────────
// Reaproveita a própria PipelineItem (parentItemId) em vez de um modelo novo —
// uma subtarefa já ganha de graça status (stage), prioridade, prazo,
// responsável, tags, atividades e anexos, exatamente como um item de topo.
// Em vários níveis desde 06/11/2026 (era 1): a subatividade também recebe
// filhas, até PROFUNDIDADE_MAXIMA — ver `src/lib/kanban/subatividades.ts`.

export async function criarSubtarefa(parentItemId: string, title: string): Promise<{ error: string } | void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const nome = title.trim();
  if (!tenantId || !nome) return;

  const prisma = getPrisma();
  const parent = await prisma.pipelineItem.findFirst({ where: { id: parentItemId, tenantId } });
  if (!parent) return { error: "Esta atividade não existe mais." };

  const pipeline = await prisma.pipeline.findFirst({ where: { id: parent.pipelineId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) {
    return { error: "Você não pode criar subatividades nesta lista." };
  }

  if (!aceitaSubatividade(await profundidadePeloPai(tenantId, parent.parentItemId))) {
    return { error: AVISO_DO_LIMITE };
  }

  try {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: parent.pipelineId },
      orderBy: { order: "asc" },
    });
    if (!firstStage) return { error: "Esta lista não tem colunas." };

    // Entra no fim das irmãs (era `order` 0, que a punha antes das que já
    // tinham ordem manual e travava a troca de lugar com as outras de 0).
    const ultima = await prisma.pipelineItem.findFirst({
      where: { tenantId, parentItemId: parent.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const sub = await prisma.pipelineItem.create({
      data: {
        tenantId,
        pipelineId: parent.pipelineId,
        stageId: firstStage.id,
        entityType: parent.entityType,
        entityId: parent.entityId,
        parentItemId: parent.id,
        title: nome,
        order: (ultima?.order ?? -1) + 1,
      },
    });

    if (userId) {
      // No pai, o que mudou nele; na nova, de onde ela veio — a subatividade
      // tem histórico próprio e abre como qualquer atividade.
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: parent.id, userId, type: ActivityType.SUBTASK_CHANGE, content: `Subatividade "${nome}" criada` },
      });
      await prisma.activity.create({
        data: {
          tenantId,
          pipelineItemId: sub.id,
          userId,
          type: ActivityType.CREATED,
          content: parent.title ? `Criada como subatividade de "${parent.title}"` : "Criada como subatividade",
        },
      });
    }
  } catch (err) {
    console.error("[criarSubtarefa]", err);
    return { error: "Não foi possível criar a subatividade. Tente de novo." };
  }

  // O detalhe do pai e a lista, onde ela também aparece embaixo dele.
  revalidarItem(pipeline, parentItemId);
}

export async function excluirSubtarefa(parentItemId: string, subtaskId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  // Excluir subtarefa: só o administrador (13/10/2026). Era o gestor do setor.
  if (!tenantId || !podeExcluir(ctx)) return;

  const prisma = getPrisma();
  const subtask = await prisma.pipelineItem.findFirst({ where: { id: subtaskId, tenantId, parentItemId } });
  if (!subtask) return;

  const pipeline = await prisma.pipeline.findFirst({ where: { id: subtask.pipelineId } });
  if (!pipeline || !canManageSector(ctx, pipeline.sectorCode)) return;

  try {
    await excluirComSubatividades(ctx, subtask);
  } catch (err) {
    console.error("[excluirSubtarefa]", err);
    return;
  }

  revalidarItem(pipeline, parentItemId);
}

// ─── Checklist ─────────────────────────────────────────────────────────────
// Lista simples por item (sem "Checklist" nomeado separado) — cobre etapas
// pequenas que não justificam virar subtarefa própria.

async function loadItemPipeline(tenantId: string, pipelineItemId: string) {
  const prisma = getPrisma();
  const item = await prisma.pipelineItem.findFirst({ where: { id: pipelineItemId, tenantId } });
  if (!item) return null;
  const pipeline = await prisma.pipeline.findFirst({ where: { id: item.pipelineId } });
  if (!pipeline) return null;
  return { prisma, item, pipeline };
}

export async function criarChecklistItem(pipelineItemId: string, textRaw: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const text = textRaw.trim();
  if (!tenantId || !text) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !(await poderesNaLista(ctx, loaded.pipeline)).editar) return;
  const { prisma, pipeline } = loaded;

  try {
    const last = await prisma.checklistItem.findFirst({
      where: { pipelineItemId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    await prisma.checklistItem.create({
      data: { tenantId, pipelineItemId, text, order: (last?.order ?? -1) + 1 },
    });
    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId, userId, type: ActivityType.CHECKLIST_CHANGE, content: `Item de checklist "${text}" adicionado` },
      });
    }
  } catch (err) {
    console.error("[criarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

export async function alternarChecklistItem(pipelineItemId: string, checklistItemId: string, done: boolean): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !(await poderesNaLista(ctx, loaded.pipeline)).editar) return;
  const { prisma, pipeline } = loaded;

  try {
    const item = await prisma.checklistItem.update({
      where: { id: checklistItemId, pipelineItemId },
      data: { done },
    });
    if (userId) {
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId, userId, type: ActivityType.CHECKLIST_CHANGE,
          content: `Item de checklist "${item.text}" ${done ? "concluído" : "reaberto"}`,
        },
      });
    }
  } catch (err) {
    console.error("[alternarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

export async function editarChecklistItem(pipelineItemId: string, checklistItemId: string, text: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId || !text.trim()) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !(await poderesNaLista(ctx, loaded.pipeline)).editar) return;
  const { prisma, pipeline } = loaded;

  try {
    await prisma.checklistItem.update({ where: { id: checklistItemId, pipelineItemId }, data: { text: text.trim() } });
  } catch (err) {
    console.error("[editarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

export async function excluirChecklistItem(pipelineItemId: string, checklistItemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  // Excluir item do checklist: só o administrador (13/10/2026). Quem age no
  // setor corrige o texto pelo "Editar" e marca/desmarca como sempre.
  if (!tenantId || !podeExcluir(ctx)) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !(await poderesNaLista(ctx, loaded.pipeline)).editar) return;
  const { prisma, pipeline } = loaded;

  try {
    await prisma.checklistItem.delete({ where: { id: checklistItemId, pipelineItemId } });
  } catch (err) {
    console.error("[excluirChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}
export async function reordenarChecklistItem(pipelineItemId: string, checklistItemId: string, direction: "up" | "down"): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !(await poderesNaLista(ctx, loaded.pipeline)).editar) return;
  const { prisma, pipeline } = loaded;

  try {
    const items = await prisma.checklistItem.findMany({ where: { pipelineItemId }, orderBy: { order: "asc" } });
    const index = items.findIndex((i) => i.id === checklistItemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= items.length) return;

    const a = items[index];
    const b = items[swapIndex];
    await prisma.$transaction([
      prisma.checklistItem.update({ where: { id: a.id }, data: { order: b.order } }),
      prisma.checklistItem.update({ where: { id: b.id }, data: { order: a.order } }),
    ]);
  } catch (err) {
    console.error("[reordenarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

// ─── Conclusão / reabertura explícita ──────────────────────────────────────
// "Concluída" continua sendo derivado do estágio terminal (não vira campo
// novo) — mas em vez de exigir que o usuário arraste até a última coluna,
// esses dois botões fazem o mesmo movimento com 1 clique e registram um
// evento de histórico específico (COMPLETED/REOPENED), distinto do
// STATUS_CHANGE genérico usado pra mover entre colunas do meio.

/**
 * Conclui a atividade. Com `comSubatividades` (06/11/2026), conclui também as
 * subatividades abertas de todos os níveis abaixo dela — a tela pergunta
 * antes, quando há alguma aberta, e vem marcado. Sem, o pai é concluído e as
 * filhas ficam como estão. Cada uma ganha o "concluída" no próprio histórico.
 */
export async function concluirTarefa(pipelineId: string, itemId: string, comSubatividades = false): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  // O item tem de ser desta lista — é ela que libera a ação.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId } });
  if (!item) return;

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  try {
    const terminalStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId, isTerminal: true },
      orderBy: { order: "desc" },
    });
    if (!terminalStage || item.stageId === terminalStage.id) return;

    const terminais = new Set(
      (await prisma.pipelineStage.findMany({ where: { pipelineId, isTerminal: true }, select: { id: true } })).map((s) => s.id)
    );
    const abertas = comSubatividades
      ? (await subarvoreDoItem(tenantId, itemId)).filter((s) => !terminais.has(s.stageId)).map((s) => s.id)
      : [];

    await prisma.pipelineItem.update({ where: { id: itemId }, data: { stageId: terminalStage.id } });
    await prisma.activity.create({
      data: {
        tenantId,
        pipelineItemId: itemId,
        userId,
        type: ActivityType.COMPLETED,
        content: abertas.length > 0 ? `Atividade concluída, com ${quantasSubatividades(abertas.length)} dentro dela` : "Atividade concluída",
      },
    });
    if (abertas.length > 0) {
      const nome = item.title ? `"${item.title}"` : "a atividade de cima";
      await prisma.pipelineItem.updateMany({ where: { id: { in: abertas }, tenantId }, data: { stageId: terminalStage.id } });
      await prisma.activity.createMany({
        data: abertas.map((id) => ({
          tenantId,
          pipelineItemId: id,
          userId,
          type: ActivityType.COMPLETED,
          content: `Concluída junto com ${nome}`,
        })),
      });
    }
  } catch (err) {
    console.error("[concluirTarefa]", err);
    return;
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  revalidatePath(`${base}/itens/${itemId}`);
}

export async function reabrirTarefa(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return;

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  try {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId, isTerminal: false },
      orderBy: { order: "asc" },
    });
    const targetStage = firstStage ?? (await prisma.pipelineStage.findFirst({ where: { pipelineId }, orderBy: { order: "asc" } }));
    if (!targetStage || item.stageId === targetStage.id) return;

    await prisma.pipelineItem.update({ where: { id: itemId }, data: { stageId: targetStage.id } });
    await prisma.activity.create({
      data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.REOPENED, content: "Atividade reaberta" },
    });
  } catch (err) {
    console.error("[reabrirTarefa]", err);
    return;
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  revalidatePath(`${base}/itens/${itemId}`);
}

// ─── Estimativa e controle de tempo ────────────────────────────────────────
// Lançamento manual (sem cronômetro ao vivo) — cobre estimativa, apontamento
// por usuário, total acumulado e comparação estimado x realizado. Nada aqui
// é obrigatório: ambos os campos ficam vazios por padrão.

export async function atualizarEstimativa(pipelineId: string, itemId: string, minutesRaw: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return;

  const trimmed = minutesRaw.trim();
  const minutes = trimmed ? parseInt(trimmed, 10) : null;
  if (trimmed && (!Number.isInteger(minutes) || minutes! < 0)) return;

  // Mesmo fix de atualizarDescricao — sem isso dava pra reescrever a
  // estimativa de um item de outro tenant/pipeline.
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId, pipelineId }, select: { id: true } });
  if (!item) return;

  try {
    await prisma.pipelineItem.update({ where: { id: itemId }, data: { estimateMinutes: minutes } });
  } catch (err) {
    console.error("[atualizarEstimativa]", err);
    return;
  }

  revalidarItem(pipeline, itemId);
}

export async function criarLancamentoTempo(pipelineItemId: string, _prev: PipelineState, form: FormData): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };

  const minutesRaw = (form.get("minutes") as string)?.trim();
  const minutes = parseInt(minutesRaw, 10);
  if (!Number.isInteger(minutes) || minutes <= 0) return { error: "Informe os minutos gastos (maior que zero)" };

  const noteRaw = (form.get("note") as string)?.trim();
  const loggedOnRaw = (form.get("loggedOn") as string)?.trim();
  const loggedOn = loggedOnRaw ? new Date(loggedOnRaw) : new Date();
  if (Number.isNaN(loggedOn.getTime())) return { error: "Data inválida" };

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !(await poderesNaLista(ctx, loaded.pipeline)).editar) {
    return { error: "Sem permissão para editar este item." };
  }
  const { prisma, pipeline } = loaded;
  // Lançamento atrasado só pela coordenação (04/11/2026, lote D).
  // O dia como veio do campo: `new Date("AAAA-MM-DD")` é meia-noite UTC, a véspera em São Paulo.
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const diaDoCampo = /^\d{4}-\d{2}-\d{2}/.test(loggedOnRaw ?? "") ? loggedOnRaw!.slice(0, 10) : hojeKey;
  const recusa = recusaDoLancamentoAtrasado(diaDoCampo, hojeKey, canManageSector(ctx, pipeline.sectorCode));
  if (recusa) return { error: recusa };

  try {
    await prisma.timeEntry.create({
      data: { tenantId, pipelineItemId, userId, minutes, note: noteRaw || null, loggedOn, source: "MANUAL" },
    });
    await prisma.activity.create({
      data: {
        tenantId, pipelineItemId, userId, type: ActivityType.TIME_LOGGED,
        content: `${minutes} min apontados${noteRaw ? ` — ${noteRaw}` : ""}`,
      },
    });
  } catch (err) {
    console.error("[criarLancamentoTempo]", err);
    return { error: "Erro ao registrar apontamento." };
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
  return null;
}

/**
 * Corrigir um apontamento de tempo do card (13/10/2026): duração, dia e nota.
 *
 * Quem apontou corrige o próprio; o gestor do setor corrige o de qualquer um —
 * a mesma regra que valia para apagar, que agora é só do administrador.
 */
export async function editarLancamentoTempo(
  pipelineId: string,
  itemId: string,
  entryId: string,
  _prev: EstadoDaEdicaoDeHoras,
  form: FormData,
): Promise<EstadoDaEdicaoDeHoras> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };

  const lido = lerLancamentoDeHoras(form);
  if (!lido.ok) return { error: lido.error };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !(await poderesNaLista(ctx, pipeline)).editar) return { error: "Sem permissão para editar este apontamento." };

  const entry = await prisma.timeEntry.findFirst({
    where: { id: entryId, tenantId, pipelineItemId: itemId, pipelineItem: { pipelineId } },
    select: { userId: true, minutes: true },
  });
  if (!entry) return { error: "Apontamento não encontrado." };
  if (entry.userId !== userId && !canManageSector(ctx, pipeline.sectorCode)) {
    return { error: "Só quem apontou ou o gestor do setor corrige este apontamento." };
  }
  if (lido.dia) {
    const recusa = recusaDoLancamentoAtrasado(lido.dia.toISOString().slice(0, 10), saoPauloParts(new Date()).dateKey, canManageSector(ctx, pipeline.sectorCode));
    if (recusa) return { error: recusa };
  }

  try {
    await prisma.timeEntry.update({
      where: { id: entryId },
      data: { minutes: lido.minutos, note: lido.nota, editedAt: new Date(), ...(lido.dia ? { loggedOn: lido.dia } : {}) },
    });
    if (entry.minutes !== lido.minutos) {
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId: itemId, userId, type: ActivityType.TIME_LOGGED,
          content: `Apontamento corrigido: ${duracaoDoLancamento(entry.minutes)} → ${duracaoDoLancamento(lido.minutos)}`,
        },
      });
    }
  } catch (err) {
    console.error("[editarLancamentoTempo]", err);
    return { error: "Erro ao salvar o apontamento." };
  }

  revalidarItem(pipeline, itemId);
  return { ok: true };
}

export async function excluirLancamentoTempo(pipelineId: string, itemId: string, entryId: string): Promise<EstadoDaEdicaoDeHoras> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };
  // Apagar apontamento: só o administrador (13/10/2026). Antes, o autor e o
  // coordenador apagavam; agora eles corrigem pelo `editarLancamentoTempo`.
  if (!podeExcluir(ctx)) return { error: SO_ADMIN_EXCLUI };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return { error: "Tarefa não encontrada." };

  const entry = await prisma.timeEntry.findFirst({
    where: { id: entryId, tenantId, pipelineItemId: itemId, pipelineItem: { pipelineId } },
    select: { id: true },
  });
  if (!entry) return { error: "Apontamento não encontrado." };

  try {
    await prisma.timeEntry.delete({ where: { id: entryId } });
  } catch (err) {
    console.error("[excluirLancamentoTempo]", err);
    return { error: "Erro ao apagar o apontamento." };
  }

  revalidarItem(pipeline, itemId);
  return { ok: true };
}

// ─── Duplicar Pipeline ──────────────────────────────────────────────────────
// Clona um Pipeline inteiro (estágios, tarefas de topo, subtarefas, checklist
// e tags) pra uma empresa/pessoa de destino diferente — cobre o caso de
// "template padrão" que se repete por cliente (ex.: processo de implantação
// do BPO): monta o template 1x, depois duplica e aponta pro cliente novo em
// vez de recriar tudo manualmente. Prazos e responsáveis NÃO são copiados
// (ficam em branco na cópia) — são específicos de cada execução real.

export async function duplicarPipeline(
  sourcePipelineId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  const entityId = (form.get("entityId") as string)?.trim();
  if (!name) return { error: "Nome da nova tarefa é obrigatório" };
  if (!entityId) return { error: "Selecione a empresa ou pessoa de destino" };

  const prisma = getPrisma();
  // Todos os itens, de todos os níveis: a cópia remonta a árvore inteira
  // (06/11/2026; copiava a atividade e só o primeiro nível abaixo dela).
  const source = await prisma.pipeline.findFirst({
    where: { id: sourcePipelineId, ...accessiblePipelineWhere(ctx) },
    include: {
      stages: { orderBy: { order: "asc" } },
      items: {
        include: {
          tags: { select: { tagId: true } },
          checklist: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!source) return { error: "Tarefa de origem não encontrada." };
  if (!(await poderesNaLista(ctx, source)).editar) {
    return { error: "Sem permissão para duplicar tarefa neste setor." };
  }

  const entity =
    source.entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: entityId, tenantId } })
      : await prisma.person.findFirst({ where: { id: entityId, tenantId } });
  if (!entity) return { error: "Empresa ou pessoa de destino não encontrada." };

  let newPipelineId: string;
  try {
    const created = await prisma.pipeline.create({
      data: {
        tenantId,
        name,
        sectorCode: source.sectorCode,
        spaceId: source.spaceId,
        folderId: source.folderId,
        color: source.color,
        entityType: source.entityType,
        stages: {
          create: source.stages.map((s) => ({ name: s.name, color: s.color, order: s.order, isTerminal: s.isTerminal, type: s.type })),
        },
      },
      include: { stages: true },
    });
    newPipelineId = created.id;

    const stageMap = new Map<string, string>();
    for (const oldStage of source.stages) {
      const newStage = created.stages.find((s) => s.order === oldStage.order);
      if (newStage) stageMap.set(oldStage.id, newStage.id);
    }

    // De cima para baixo: o pai nasce antes das filhas, que já apontam para
    // o id novo dele. A ordem manual vai junto. A subatividade sem coluna
    // equivalente fica na do pai; a atividade sem coluna fica de fora (com as
    // filhas), como antes.
    type ItemDaOrigem = NonNullable<typeof source>["items"][number];
    const copiar = async (no: NoDaArvore<ItemDaOrigem>, novoPai: { id: string; stageId: string } | null): Promise<void> => {
      const newStageId = stageMap.get(no.stageId) ?? novoPai?.stageId;
      if (!newStageId) return;
      const novo = await prisma.pipelineItem.create({
        data: {
          tenantId,
          pipelineId: newPipelineId,
          stageId: newStageId,
          entityType: source.entityType,
          entityId,
          parentItemId: novoPai?.id ?? null,
          title: no.title,
          description: no.description,
          priority: no.priority,
          order: no.order,
          tags: no.tags.length > 0 ? { create: no.tags.map((t) => ({ tagId: t.tagId })) } : undefined,
          checklist:
            no.checklist.length > 0
              ? { create: no.checklist.map((c) => ({ tenantId, text: c.text, order: c.order })) }
              : undefined,
        },
      });
      for (const filha of no.filhas) await copiar(filha, { id: novo.id, stageId: newStageId });
    };
    for (const raiz of montarArvore(source.items)) await copiar(raiz, null);
  } catch (err) {
    console.error("[duplicarPipeline]", err);
    return { error: "Erro ao duplicar a tarefa. Tente novamente." };
  }

  redirect(boardPath({ id: newPipelineId }));
}

// Documentos (canvas) por tarefa — removido em 2026-07-24, virou módulo
// próprio "Manual" (ver src/app/(app)/manuais/actions.ts).
