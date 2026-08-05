"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { boardPath } from "@/lib/kanbanPaths";
import type { PipelineState } from "@/app/(app)/kanban/actions";

// Estágios padrão usados pelas Listas criadas pelo fluxo simplificado
// ("Nova lista") — mesmo conjunto já em uso nos boards do BPO.
const DEFAULT_STAGES = [
  { name: "A Fazer", order: 0, color: "#586577", isTerminal: false },
  { name: "Em Andamento", order: 1, color: "#2563EB", isTerminal: false },
  { name: "Aguardando Cliente", order: 2, color: "#CA8A04", isTerminal: false },
  { name: "Concluído", order: 3, color: "#059669", isTerminal: true },
];

export async function criarEspaco(sectorCode: string, _prev: PipelineState, form: FormData): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };
  if (!canManageSector(ctx, sectorCode)) return { error: "Sem permissão para criar espaço neste setor." };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome do espaço é obrigatório" };

  const prisma = getPrisma();
  try {
    await prisma.space.create({ data: { tenantId, sectorCode, name } });
  } catch (err) {
    console.error("[criarEspaco]", err);
    return { error: "Erro ao criar espaço. Já existe um espaço com esse nome neste setor?" };
  }

  revalidatePath(`/setor/${sectorCode}`);
  return null;
}

export async function criarPasta(spaceId: string, _prev: PipelineState, form: FormData): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId } });
  if (!space) return { error: "Espaço não encontrado." };
  if (!canManageSector(ctx, space.sectorCode)) return { error: "Sem permissão para criar pasta neste espaço." };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome da pasta é obrigatório" };

  try {
    await prisma.folder.create({ data: { tenantId, spaceId, name } });
  } catch (err) {
    console.error("[criarPasta]", err);
    return { error: "Erro ao criar pasta." };
  }

  revalidatePath(`/setor/${space.sectorCode}/espacos/${spaceId}`);
  return null;
}

// Fluxo "Nova lista" simplificado — só pede nome (+ descrição opcional).
// Estágios/entityType usam o padrão do setor; ajustes finos continuam
// disponíveis no board da lista depois de criada.
export async function criarListaSimples(
  spaceId: string,
  folderId: string | null,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId } });
  if (!space) return { error: "Espaço não encontrado." };
  if (!canManageSector(ctx, space.sectorCode)) return { error: "Sem permissão para criar lista neste espaço." };

  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, spaceId } });
    if (!folder) return { error: "Pasta não encontrada." };
  }

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome da lista é obrigatório" };
  const description = (form.get("description") as string)?.trim() || null;

  let destination: string;
  try {
    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        sectorCode: space.sectorCode,
        spaceId,
        folderId,
        name,
        description,
        entityType: "COMPANY",
        stages: { create: DEFAULT_STAGES },
      },
    });
    destination = boardPath(pipeline);
  } catch (err) {
    console.error("[criarListaSimples]", err);
    return { error: "Erro ao criar lista." };
  }

  redirect(destination);
}

// ─── Exclusão ──────────────────────────────────────────────────────────────
// Espaço → Pasta → Lista → Tarefa é uma hierarquia, e as três exclusões abaixo
// se recusam a apagar container que ainda tem coisa dentro. Cascata seria uma
// destruição em massa disparada por um clique, sem lixeira pra desfazer —
// exigir esvaziar antes é a mesma regra que a exclusão de estágio já aplica
// ("Mova as tarefas de X antes de excluir esse estágio").
//
// Só quem administra o setor exclui, o mesmo teto de quem cria.

export async function excluirEspaco(spaceId: string): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId },
    include: { _count: { select: { folders: true, pipelines: true } } },
  });
  if (!space) return { error: "Espaço não encontrado." };
  if (!canManageSector(ctx, space.sectorCode)) return { error: "Sem permissão para excluir este espaço." };

  if (space._count.pipelines > 0 || space._count.folders > 0) {
    const partes: string[] = [];
    if (space._count.folders > 0) partes.push(`${space._count.folders} ${space._count.folders === 1 ? "pasta" : "pastas"}`);
    if (space._count.pipelines > 0) partes.push(`${space._count.pipelines} ${space._count.pipelines === 1 ? "lista" : "listas"}`);
    return { error: `Esvazie o espaço antes de excluir — ele ainda tem ${partes.join(" e ")}.` };
  }

  try {
    await prisma.space.delete({ where: { id: spaceId } });
  } catch (err) {
    console.error("[excluirEspaco]", err);
    return { error: "Erro ao excluir o espaço." };
  }

  revalidatePath(`/setor/${space.sectorCode}`);
  return null;
}

export async function excluirPasta(folderId: string): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, tenantId },
    include: { space: true, _count: { select: { pipelines: true } } },
  });
  if (!folder) return { error: "Pasta não encontrada." };
  if (!canManageSector(ctx, folder.space.sectorCode)) return { error: "Sem permissão para excluir esta pasta." };

  if (folder._count.pipelines > 0) {
    return {
      error: `Mova ou exclua as ${folder._count.pipelines === 1 ? "lista" : `${folder._count.pipelines} listas`} desta pasta antes de excluí-la.`,
    };
  }

  try {
    await prisma.folder.delete({ where: { id: folderId } });
  } catch (err) {
    console.error("[excluirPasta]", err);
    return { error: "Erro ao excluir a pasta." };
  }

  revalidatePath(`/setor/${folder.space.sectorCode}/espacos/${folder.spaceId}`);
  return null;
}

export async function excluirLista(pipelineId: string): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId },
    include: { space: true, _count: { select: { items: true, recurringObligations: true } } },
  });
  if (!pipeline) return { error: "Lista não encontrada." };
  if (!canManageSector(ctx, pipeline.sectorCode)) return { error: "Sem permissão para excluir esta lista." };

  if (pipeline._count.items > 0) {
    return {
      error: `Exclua as ${pipeline._count.items === 1 ? "tarefa" : `${pipeline._count.items} tarefas`} desta lista antes de excluí-la.`,
    };
  }
  // Obrigação recorrente aponta pra Lista e continuaria gerando tarefa num
  // destino que não existe mais — some da checagem de "vazio" porque não é
  // conteúdo visível no board, mas trava a exclusão do mesmo jeito.
  if (pipeline._count.recurringObligations > 0) {
    return { error: "Esta lista é destino de obrigações recorrentes. Aponte-as para outra lista antes de excluí-la." };
  }

  try {
    // Os estágios são cascata da própria Lista (onDelete: Cascade em
    // PipelineStage) — sem itens, não sobra nada mais pendurado.
    await prisma.pipeline.delete({ where: { id: pipelineId } });
  } catch (err) {
    console.error("[excluirLista]", err);
    return { error: "Erro ao excluir a lista." };
  }

  revalidatePath(`/setor/${pipeline.sectorCode}/espacos/${pipeline.spaceId}`);
  if (pipeline.folderId) revalidatePath(`/setor/${pipeline.sectorCode}/pastas/${pipeline.folderId}`);
  revalidatePath("/kanban");
  return null;
}
