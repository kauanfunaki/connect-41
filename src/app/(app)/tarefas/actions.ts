"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { serializeTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";
import type { ActionState } from "@/lib/actionState";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { logAudit } from "@/lib/audit";
import { podeConfigurarAPessoa, podeConfigurarOSetor } from "@/lib/meuDia/configuracao";

// O padrão do setor: Admin e Super Admin desde 28/10/2026 (era só o Super
// Admin) e, desde 10/11/2026 (pedido do Kauan), também o coordenador do setor
// (SECTOR_ADMIN dele). O Meu dia de cada pessoa — dela, do coordenador para a
// equipe, do admin para qualquer um — está em `salvarMeuDiaDaPessoa`, abaixo.
// A action é a barreira real; o que a faixa mostra é só cortesia.
const SEM_PERMISSAO_NO_SETOR = "Só o coordenador do setor, o Admin ou o Super Admin configuram o padrão do setor.";

const FALTA_A_MIGRATION =
  "Falta atualizar o banco para guardar o Meu dia de cada pessoa (a migration “meu_dia_por_pessoa”). Até lá vale o do setor.";

/** A pessoa do Meu dia, se quem pede pode configurá-la. */
async function pessoaConfiguravel(userId: string) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { ok: false, erro: "Não autenticado" } as const;
  const pessoa = await getPrisma().user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId },
    select: { id: true, role: true, sectors: { select: { sectorCode: true } } },
  });
  if (!pessoa) return { ok: false, erro: "Pessoa não encontrada neste workspace." } as const;
  const alvo = { id: pessoa.id, role: pessoa.role, sectors: pessoa.sectors.map((s) => s.sectorCode) };
  if (!podeConfigurarAPessoa(ctx, alvo)) return { ok: false, erro: "Sem permissão para configurar o Meu dia desta pessoa." } as const;
  return { ok: true, ctx, tenantId: ctx.tenantId, pessoa: alvo } as const;
}

/**
 * O Meu dia de uma pessoa (28/10/2026): ela mesma, o coordenador de um setor
 * dela (se ela é colaboradora) ou o admin. Vale mais que a do setor.
 */
export async function salvarMeuDiaDaPessoa(userId: string, keys: TaskWidgetKey[]): Promise<ActionState> {
  const r = await pessoaConfiguravel(userId);
  if (!r.ok) return { error: r.erro };
  const widgets = serializeTaskWidgets(keys);
  try {
    await getPrisma().userTaskView.upsert({
      where: { userId },
      create: { tenantId: r.tenantId, userId, widgets, updatedById: r.ctx.userId },
      update: { widgets, updatedById: r.ctx.userId },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { error: FALTA_A_MIGRATION };
    console.error("[salvarMeuDiaDaPessoa]", err);
    return { error: "Erro ao salvar o Meu dia." };
  }
  revalidatePath("/tarefas");
  return null;
}

/** Apaga a configuração da pessoa: ela volta a ver o padrão dos setores dela. */
export async function restaurarMeuDiaDaPessoa(userId: string): Promise<ActionState> {
  const r = await pessoaConfiguravel(userId);
  if (!r.ok) return { error: r.erro };
  try {
    await getPrisma().userTaskView.deleteMany({ where: { tenantId: r.tenantId, userId } });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return null;
    console.error("[restaurarMeuDiaDaPessoa]", err);
    return { error: "Erro ao restaurar o Meu dia." };
  }
  revalidatePath("/tarefas");
  return null;
}

export async function salvarWidgetsSetor(
  sectorCode: string,
  keys: TaskWidgetKey[]
): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!sectorCode) return { error: "Setor não informado." };
  if (!podeConfigurarOSetor(ctx, sectorCode)) return { error: SEM_PERMISSAO_NO_SETOR };

  const prisma = getPrisma();

  // Setor precisa existir no tenant — sem isso, um código digitado errado
  // criaria uma configuração órfã que nunca seria lida por ninguém.
  const setor = await prisma.sector.findFirst({
    where: { tenantId: ctx.tenantId, code: sectorCode },
    select: { id: true, label: true },
  });
  if (!setor) return { error: "Setor não encontrado neste workspace." };

  const widgets = serializeTaskWidgets(keys);

  try {
    await prisma.sectorTaskView.upsert({
      where: { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode } },
      create: { tenantId: ctx.tenantId, sectorCode, widgets },
      update: { widgets },
    });
  } catch (err) {
    console.error("[salvarWidgetsSetor]", err);
    return { error: "Erro ao salvar a configuração do Meu dia." };
  }

  // Na auditoria desde que o coordenador também configura (10/11/2026).
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.meu_dia.update",
    entityType: "Sector",
    entityId: setor.id,
    metadata: { setor: setor.label, blocos: keys.join(", ") },
  });

  revalidatePath("/tarefas");
  return null;
}

// Volta o setor ao padrão apagando a linha — ausência de configuração é lida
// como "todos os blocos do catálogo", inclusive os que forem lançados depois.
export async function restaurarWidgetsSetor(sectorCode: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!podeConfigurarOSetor(ctx, sectorCode)) return { error: SEM_PERMISSAO_NO_SETOR };

  const prisma = getPrisma();
  try {
    await prisma.sectorTaskView.deleteMany({ where: { tenantId: ctx.tenantId, sectorCode } });
  } catch (err) {
    console.error("[restaurarWidgetsSetor]", err);
    return { error: "Erro ao restaurar o Meu dia." };
  }
  const setor = await prisma.sector.findFirst({ where: { tenantId: ctx.tenantId, code: sectorCode }, select: { id: true, label: true } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.meu_dia.reset",
    entityType: "Sector",
    entityId: setor?.id ?? sectorCode,
    metadata: { setor: setor?.label ?? sectorCode },
  });

  revalidatePath("/tarefas");
  return null;
}
