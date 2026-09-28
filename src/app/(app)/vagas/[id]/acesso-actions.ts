"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { SETOR_RECRUTAMENTO } from "@/lib/recrutamento/acessoVagas";

/**
 * O coordenador do Recrutamento diz quem do setor vê a vaga (decisão de
 * 28/09/2026). `restrita=false` volta ao padrão, todo recrutador vê. Com
 * `restrita=true`, só os escolhidos — nenhum escolhido esconde de todos.
 *
 * A lista é trocada inteira e guardada mesmo com a vaga aberta a todos, para
 * o coordenador poder alternar sem refazer a escolha.
 */
export async function salvarAcessoDosRecrutadores(
  vagaId: string,
  restrita: boolean,
  userIds: string[]
): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canManageSector(ctx, SETOR_RECRUTAMENTO)) {
    return { error: "Só o coordenador do Recrutamento decide quem vê a vaga." };
  }

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({ where: { id: vagaId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!vaga) return { error: "Vaga não encontrada." };

  // Só entra quem é do Recrutamento e está ativo — id que veio do navegador
  // não vira acesso a vaga para quem não é recrutador.
  const pedidos = [...new Set(userIds.filter((u) => typeof u === "string" && u))];
  const validos = pedidos.length
    ? await prisma.user.findMany({
        where: {
          id: { in: pedidos },
          tenantId: ctx.tenantId,
          active: true,
          sectors: { some: { sectorCode: SETOR_RECRUTAMENTO } },
        },
        select: { id: true },
      })
    : [];
  const ids = validos.map((u) => u.id);

  await prisma.$transaction([
    prisma.vaga.update({ where: { id: vagaId }, data: { restrictedToRecruiters: restrita } }),
    prisma.vagaRecrutador.deleteMany({ where: { vagaId, userId: { notIn: ids } } }),
    prisma.vagaRecrutador.createMany({
      data: ids.map((userId) => ({ tenantId: ctx.tenantId, vagaId, userId, createdById: ctx.userId })),
      skipDuplicates: true,
    }),
  ]);

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "vaga.acesso_recrutadores",
    entityType: "Vaga",
    entityId: vagaId,
    metadata: { restrita, recrutadores: ids.length },
  });

  revalidatePath(`/vagas/${vagaId}`);
  revalidatePath("/vagas");
  return { ok: true };
}
