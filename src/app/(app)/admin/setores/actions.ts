"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";

export type SetorState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export async function criarSetor(
  _prev: SetorState,
  form: FormData
): Promise<SetorState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para gerenciar setores." };

  const label = (form.get("label") as string)?.trim();
  const color = (form.get("color") as string)?.trim() || "#586577";

  if (!label) return { error: "Nome do setor é obrigatório" };

  const code = slugify(label);
  if (!code) return { error: "Não foi possível gerar um código a partir desse nome." };

  const prisma = getPrisma();

  try {
    const maxOrder = await prisma.sector.aggregate({
      where: { tenantId: ctx.tenantId },
      _max: { order: true },
    });
    await prisma.sector.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        label,
        color,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe um setor com o código "${code}". Escolha um nome diferente.` };
    }
    console.error("[criarSetor]", err);
    return { error: "Erro ao criar setor. Tente novamente." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "sector.create", entityType: "Sector", metadata: { code, label } });

  revalidatePath("/admin/setores");
  redirect("/admin/setores");
}

export async function atualizarSetor(
  _prev: SetorState,
  form: FormData
): Promise<SetorState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para gerenciar setores." };

  const id = form.get("id") as string;
  const label = (form.get("label") as string)?.trim();
  const color = (form.get("color") as string)?.trim() || "#586577";
  const active = form.get("active") === "on";
  const orderRaw = (form.get("order") as string)?.trim();

  if (!label) return { error: "Nome do setor é obrigatório" };

  const prisma = getPrisma();

  const existing = await prisma.sector.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Setor não encontrado." };

  try {
    await prisma.sector.update({
      where: { id },
      data: {
        label,
        color,
        active,
        order: orderRaw ? parseInt(orderRaw) : existing.order,
      },
    });
  } catch (err) {
    console.error("[atualizarSetor]", err);
    return { error: "Erro ao atualizar setor." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "sector.update", entityType: "Sector", entityId: id, metadata: { label } });

  revalidatePath("/admin/setores");
  redirect("/admin/setores");
}
