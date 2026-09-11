"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { grupoDeTexto } from "@/lib/dre/mapeamento";

export type AcaoDoDre = { error: string } | { success: true } | null;

const SETOR = "bpo";

async function contexto(companyId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado" };
  if (!canActOnSector(ctx, SETOR)) return { ok: false as const, erro: "Sem permissão no BPO." };
  const tenantId = ctx.tenantId;

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true },
  });
  if (!empresa) return { ok: false as const, erro: "Empresa não encontrada." };

  return { ok: true as const, ctx, tenantId, prisma };
}

/**
 * Classifica uma categoria no DRE desta empresa.
 *
 * Grava **exceção**, e não padrão: o padrão vive no plano de contas e tem tela
 * própria. Classificar aqui é dizer "nesta empresa é assim", que é a pergunta
 * que a fila de não classificados faz.
 */
export async function classificarCategoria(
  companyId: string,
  categoryId: string,
  grupo: string
): Promise<AcaoDoDre> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  // Valida contra a estrutura, não contra o banco: grupo inventado sairia do
  // relatório sem somar em linha nenhuma, que é o mesmo que sumir.
  const valido = grupoDeTexto(grupo);
  if (!valido) return { error: "Grupo do DRE desconhecido." };

  const categoria = await c.prisma.financeCategory.findFirst({
    where: { id: categoryId, tenantId: c.tenantId },
    select: { id: true },
  });
  if (!categoria) return { error: "Categoria não encontrada." };

  await c.prisma.dreCategoryMapping.upsert({
    where: { companyId_categoryId: { companyId, categoryId } },
    create: { tenantId: c.tenantId, companyId, categoryId, grupo: valido },
    update: { grupo: valido },
  });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.map",
    entityType: "Company",
    entityId: companyId,
    metadata: { categoryId, grupo: valido },
  });

  revalidatePath("/dre");
  return { success: true };
}

/** Remove a exceção — a categoria volta a seguir o plano de contas. */
export async function voltarAoPadrao(companyId: string, categoryId: string): Promise<AcaoDoDre> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  await c.prisma.dreCategoryMapping.deleteMany({ where: { companyId, categoryId } });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "dre.unmap",
    entityType: "Company",
    entityId: companyId,
    metadata: { categoryId },
  });

  revalidatePath("/dre");
  return { success: true };
}
