"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { CustomFieldType, EntityType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";

export type CampoState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 80);
}

function parseOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export async function criarCampo(
  _prev: CampoState,
  form: FormData
): Promise<CampoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const sectorCode = (form.get("sectorCode") as string)?.trim();
  const entityType = form.get("entityType") as EntityType;
  const label = (form.get("label") as string)?.trim();
  const fieldType = form.get("fieldType") as CustomFieldType;
  const optionsRaw = (form.get("options") as string) ?? "";
  const required = form.get("required") === "on";

  if (!sectorCode) return { error: "Setor é obrigatório" };
  if (!label) return { error: "Nome do campo é obrigatório" };
  if (!canManageSector(ctx, sectorCode)) {
    return { error: "Sem permissão para criar campos neste setor." };
  }

  const key = slugify(label);
  if (!key) return { error: "Não foi possível gerar uma chave a partir desse nome." };

  const options = fieldType === "SELECT" ? parseOptions(optionsRaw) : undefined;
  if (fieldType === "SELECT" && (!options || options.length === 0)) {
    return { error: "Informe ao menos uma opção para campos do tipo Seleção." };
  }

  const prisma = getPrisma();

  try {
    const maxOrder = await prisma.customField.aggregate({
      where: { tenantId: ctx.tenantId, sectorCode, entityType },
      _max: { order: true },
    });
    await prisma.customField.create({
      data: {
        tenantId: ctx.tenantId,
        sectorCode,
        entityType,
        key,
        label,
        fieldType,
        options,
        required,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe um campo com a chave "${key}" nesse setor/entidade.` };
    }
    console.error("[criarCampo]", err);
    return { error: "Erro ao criar campo. Tente novamente." };
  }

  revalidatePath("/admin/campos");
  redirect("/admin/campos");
}

export async function atualizarCampo(
  _prev: CampoState,
  form: FormData
): Promise<CampoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const id = form.get("id") as string;
  const label = (form.get("label") as string)?.trim();
  const fieldType = form.get("fieldType") as CustomFieldType;
  const optionsRaw = (form.get("options") as string) ?? "";
  const required = form.get("required") === "on";
  const orderRaw = (form.get("order") as string)?.trim();

  if (!label) return { error: "Nome do campo é obrigatório" };

  const prisma = getPrisma();
  const existing = await prisma.customField.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Campo não encontrado." };
  if (!canManageSector(ctx, existing.sectorCode)) {
    return { error: "Sem permissão para editar campos deste setor." };
  }

  const options = fieldType === "SELECT" ? parseOptions(optionsRaw) : undefined;
  if (fieldType === "SELECT" && (!options || options.length === 0)) {
    return { error: "Informe ao menos uma opção para campos do tipo Seleção." };
  }

  try {
    await prisma.customField.update({
      where: { id },
      data: {
        label,
        fieldType,
        options,
        required,
        order: orderRaw ? parseInt(orderRaw) : existing.order,
      },
    });
  } catch (err) {
    console.error("[atualizarCampo]", err);
    return { error: "Erro ao atualizar campo." };
  }

  revalidatePath("/admin/campos");
  redirect("/admin/campos");
}

export async function excluirCampo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;

  const prisma = getPrisma();
  const existing = await prisma.customField.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  try {
    await prisma.customField.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCampo]", err);
    return;
  }

  revalidatePath("/admin/campos");
}
