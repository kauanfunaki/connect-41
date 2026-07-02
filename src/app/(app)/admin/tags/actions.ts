"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";

export type TagState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export async function criarTag(_prev: TagState, form: FormData): Promise<TagState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const sectorCode = (form.get("sectorCode") as string)?.trim();
  const name = (form.get("name") as string)?.trim();
  const color = (form.get("color") as string)?.trim();

  if (!sectorCode) return { error: "Setor é obrigatório" };
  if (!name) return { error: "Nome da tag é obrigatório" };
  if (!canManageSector(ctx, sectorCode)) {
    return { error: "Sem permissão para criar tags neste setor." };
  }

  const prisma = getPrisma();
  try {
    await prisma.tag.create({
      data: { tenantId: ctx.tenantId, sectorCode, name, color: color || "#586577" },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe uma tag "${name}" nesse setor.` };
    }
    console.error("[criarTag]", err);
    return { error: "Erro ao criar tag. Tente novamente." };
  }

  revalidatePath("/admin/tags");
  redirect("/admin/tags");
}

export async function atualizarTag(_prev: TagState, form: FormData): Promise<TagState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const id = form.get("id") as string;
  const name = (form.get("name") as string)?.trim();
  const color = (form.get("color") as string)?.trim();

  if (!name) return { error: "Nome da tag é obrigatório" };

  const prisma = getPrisma();
  const existing = await prisma.tag.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Tag não encontrada." };
  if (!canManageSector(ctx, existing.sectorCode)) {
    return { error: "Sem permissão para editar tags deste setor." };
  }

  try {
    await prisma.tag.update({ where: { id }, data: { name, color: color || existing.color } });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe uma tag "${name}" nesse setor.` };
    }
    console.error("[atualizarTag]", err);
    return { error: "Erro ao atualizar tag." };
  }

  revalidatePath("/admin/tags");
  redirect("/admin/tags");
}

export async function excluirTag(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;

  const prisma = getPrisma();
  const existing = await prisma.tag.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  try {
    await prisma.tag.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirTag]", err);
    return;
  }

  revalidatePath("/admin/tags");
}
