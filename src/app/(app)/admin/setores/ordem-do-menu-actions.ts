"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import { MODULE_CATALOG, ORDEM_DOS_GRUPOS } from "@/lib/module-catalog";
import { lerOrdemDoMenu } from "@/lib/menuDoSetor";

// Organizar menu (05/11/2026, pedido do Kauan): o super admin ordena os grupos
// e as telas do menu de cada setor. Só a ordem: quem vê cada tela continua
// decidido pelo módulo e pela permissão. Regras em `src/lib/menuDoSetor.ts`.

const SO_SUPER_ADMIN = "Só o Super Admin organiza o menu dos setores.";
const GRUPOS = new Set<string>(ORDEM_DOS_GRUPOS);
const TELAS = new Set(MODULE_CATALOG.map((m) => m.code));

async function setorDoEscritorio(tenantId: string, sectorId: string) {
  if (!sectorId) return null;
  return getPrisma().sector.findFirst({ where: { id: sectorId, tenantId }, select: { code: true, label: true } });
}

/** Grava a ordem do menu do setor. `json`: { grupos, telas } — o que não for grupo ou tela do catálogo é descartado. */
export async function salvarOrdemDoMenu(sectorId: string, json: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (ctx.role !== "SUPER_ADMIN" || ctx.subscriptionReadOnly) return { error: SO_SUPER_ADMIN };
  const setor = await setorDoEscritorio(ctx.tenantId, sectorId);
  if (!setor) return { error: "Setor não encontrado neste escritório." };

  const lida = lerOrdemDoMenu(json);
  const ordem = { grupos: lida.grupos.filter((g) => GRUPOS.has(g)), telas: lida.telas.filter((t) => TELAS.has(t)) };
  const chave = { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode: setor.code } };
  try {
    await getPrisma().sectorMenuOrder.upsert({
      where: chave,
      create: { tenantId: ctx.tenantId, sectorCode: setor.code, ordem: JSON.stringify(ordem), updatedById: ctx.userId },
      update: { ordem: JSON.stringify(ordem), updatedById: ctx.userId },
    });
  } catch (err) {
    console.error("[salvarOrdemDoMenu]", err);
    return { error: "Não foi possível salvar a ordem do menu. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.menu.ordem",
    entityType: "Sector",
    entityId: sectorId,
    metadata: { setor: setor.code, grupos: ordem.grupos, telas: ordem.telas },
  });
  revalidatePath("/", "layout");
  return null;
}

/** Volta o menu do setor à ordem padrão (a do catálogo). */
export async function restaurarOrdemDoMenu(sectorId: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (ctx.role !== "SUPER_ADMIN" || ctx.subscriptionReadOnly) return { error: SO_SUPER_ADMIN };
  const setor = await setorDoEscritorio(ctx.tenantId, sectorId);
  if (!setor) return { error: "Setor não encontrado neste escritório." };

  try {
    await getPrisma().sectorMenuOrder.deleteMany({ where: { tenantId: ctx.tenantId, sectorCode: setor.code } });
  } catch (err) {
    console.error("[restaurarOrdemDoMenu]", err);
    return { error: "Não foi possível voltar à ordem padrão. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.menu.ordem_padrao",
    entityType: "Sector",
    entityId: sectorId,
    metadata: { setor: setor.code },
  });
  revalidatePath("/", "layout");
  return null;
}
