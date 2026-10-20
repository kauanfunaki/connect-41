"use server";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { CustomFieldType, EntityType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, podeExcluir } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { ordemValida } from "@/lib/camposCustomizados/ordem";

export type CampoState = { error: string } | null;

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

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "customfield.create", entityType: "CustomField", metadata: { sectorCode, entityType, key, label } });

  revalidatePath("/admin/campos");
  redirect(`/admin/campos?ficha=${entityType}&setor=${encodeURIComponent(sectorCode)}`);
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

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "customfield.update", entityType: "CustomField", entityId: id, metadata: { label } });

  revalidatePath("/admin/campos");
  // Volta à ficha e ao setor do campo, no construtor (5A, 20/10/2026).
  redirect(`/admin/campos?ficha=${existing.entityType}&setor=${encodeURIComponent(existing.sectorCode)}`);
}

/**
 * A ordem dos campos de uma ficha num setor, por arrastar no construtor (5A,
 * 20/10/2026): a posição na lista vira a ordem. Só vale a lista inteira do
 * grupo (`ordemValida`) — a tela velha, com um campo a mais ou a menos,
 * embaralharia o resto.
 */
export async function reordenarCampos(sectorCode: string, entityType: EntityType, ids: string[]): Promise<CampoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (entityType !== "COMPANY" && entityType !== "PERSON") return { error: "Ficha inválida." };
  if (!canManageSector(ctx, sectorCode)) return { error: "Sem permissão para mudar os campos deste setor." };

  const prisma = getPrisma();
  const doGrupo = await prisma.customField.findMany({ where: { tenantId: ctx.tenantId, sectorCode, entityType }, select: { id: true } });
  const pedida = Array.isArray(ids) ? ids.map(String) : [];
  if (!ordemValida(pedida, doGrupo.map((c) => c.id))) {
    return { error: "A lista de campos mudou noutra tela. Atualize a página e tente de novo." };
  }

  try {
    await prisma.$transaction(pedida.map((id, i) => prisma.customField.update({ where: { id }, data: { order: i } })));
  } catch (err) {
    console.error("[reordenarCampos]", err);
    return { error: "Erro ao salvar a ordem dos campos." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "customfield.reorder",
    entityType: "CustomField",
    metadata: { setor: sectorCode, ficha: entityType, campos: pedida.length },
  });

  revalidatePath("/admin/campos");
  return null;
}

export async function excluirCampo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  // Excluir: só o administrador (13/10/2026). O gestor do setor cria e edita.
  if (!ctx.tenantId || !podeExcluir(ctx)) return;

  const prisma = getPrisma();
  const existing = await prisma.customField.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  try {
    await prisma.customField.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCampo]", err);
    return;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "customfield.delete", entityType: "CustomField", entityId: id, metadata: { label: existing.label } });

  revalidatePath("/admin/campos");
}
