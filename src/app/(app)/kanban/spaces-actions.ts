"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import type { PipelineState } from "@/app/(app)/kanban/actions";

// Estágios padrão usados pelas Listas criadas pelo fluxo simplificado
// ("Nova lista") — mesmo conjunto já em uso no board do BPO.
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

  revalidatePath(`/bpo-financeiro`);
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

  revalidatePath(`/bpo-financeiro/espacos/${spaceId}`);
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

  let pipelineId: string;
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
    pipelineId = pipeline.id;
  } catch (err) {
    console.error("[criarListaSimples]", err);
    return { error: "Erro ao criar lista." };
  }

  redirect(`/bpo-financeiro/${pipelineId}`);
}
