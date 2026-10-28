"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { podeBloquearQuadros } from "@/lib/kanban/quadrosDosColaboradores";

export type EstadoDosQuadros = { erro: string } | { ok: true } | null;

/**
 * Libera ou bloqueia a criação e a edição de tarefas pelos colaboradores nos
 * Quadros do setor (28/10/2026). Só quem coordena o setor. Liberado é o padrão:
 * liberar apaga a linha, bloquear grava.
 */
export async function liberarQuadrosAosColaboradores(sectorCode: string, liberado: boolean): Promise<EstadoDosQuadros> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado" };
  if (!podeBloquearQuadros(ctx, sectorCode)) return { erro: "Só quem coordena o setor muda isto." };

  const prisma = getPrisma();
  const setor = await prisma.sector.findFirst({ where: { tenantId: ctx.tenantId, code: sectorCode }, select: { id: true } });
  if (!setor) return { erro: "Setor não encontrado." };

  try {
    if (liberado) {
      await prisma.sectorQuadrosBloqueados.deleteMany({ where: { tenantId: ctx.tenantId, sectorCode } });
    } else {
      await prisma.sectorQuadrosBloqueados.upsert({
        where: { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode } },
        create: { tenantId: ctx.tenantId, sectorCode, createdById: ctx.userId || null },
        update: {},
      });
    }
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      return { erro: "Falta atualizar o banco (a migration “quadros_bloqueados_por_setor”). Até lá os Quadros seguem liberados." };
    }
    console.error("[liberarQuadrosAosColaboradores]", err);
    return { erro: "Não deu para gravar. Tente de novo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: liberado ? "sector.quadros.liberar" : "sector.quadros.bloquear",
    entityType: "Sector",
    entityId: setor.id,
    metadata: { sectorCode },
  });

  revalidatePath(`/setor/${sectorCode}`, "layout");
  return { ok: true };
}
