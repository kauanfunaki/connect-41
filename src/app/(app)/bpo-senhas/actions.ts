"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { pick } from "@/lib/forms";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";

export type BpoCredencialState = ActionState;

const SECTOR = "bpo";

function credencialData(form: FormData) {
  return {
    title:     (form.get("title") as string)?.trim(),
    companyId: pick(form, "companyId"),
    username:  pick(form, "username"),
    url:       pick(form, "url"),
    notes:     pick(form, "notes"),
  };
}

export async function criarCredencial(
  _prev: BpoCredencialState,
  form: FormData
): Promise<BpoCredencialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canManageSector(ctx, SECTOR)) return { error: "Só o coordenador do BPO pode cadastrar credenciais." };

  const data = credencialData(form);
  const password = (form.get("password") as string)?.trim();
  if (!data.title) return { error: "Título é obrigatório" };
  if (!password) return { error: "Senha é obrigatória" };

  const prisma = getPrisma();
  let id: string;
  try {
    const created = await prisma.bpoCredential.create({
      data: {
        tenantId: ctx.tenantId,
        title: data.title,
        companyId: data.companyId,
        username: data.username,
        url: data.url,
        notes: data.notes,
        passwordEnc: encryptSecret(password),
        createdById: ctx.userId,
      },
    });
    id = created.id;
  } catch (err) {
    console.error("[criarCredencial]", err);
    return { error: "Erro ao criar credencial. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "bpoCredential.create",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: data.title },
  });

  revalidatePath("/bpo-senhas");
  return null;
}

export async function atualizarCredencial(
  id: string,
  _prev: BpoCredencialState,
  form: FormData
): Promise<BpoCredencialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canManageSector(ctx, SECTOR)) return { error: "Só o coordenador do BPO pode editar credenciais." };

  const existing = await getPrisma().bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existing) return { error: "Credencial não encontrada." };

  const data = credencialData(form);
  if (!data.title) return { error: "Título é obrigatório" };
  const password = (form.get("password") as string)?.trim();

  const prisma = getPrisma();
  try {
    await prisma.bpoCredential.update({
      where: { id },
      data: {
        title: data.title,
        companyId: data.companyId,
        username: data.username,
        url: data.url,
        notes: data.notes,
        // Senha só é regravada se o usuário digitou uma nova — campo vazio no
        // formulário de edição significa "manter a atual" (nunca mostramos a
        // senha real ali pra não expô-la desnecessariamente).
        ...(password ? { passwordEnc: encryptSecret(password) } : {}),
      },
    });
  } catch (err) {
    console.error("[atualizarCredencial]", err);
    return { error: "Erro ao atualizar credencial." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "bpoCredential.update",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: data.title },
  });

  revalidatePath("/bpo-senhas");
  return null;
}

export async function excluirCredencial(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !canManageSector(ctx, SECTOR)) return;

  const prisma = getPrisma();
  const existing = await prisma.bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, title: true } });
  if (!existing) return;

  try {
    await prisma.bpoCredential.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCredencial]", err);
    return;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "bpoCredential.delete",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: existing.title },
  });

  revalidatePath("/bpo-senhas");
}

// Revela a senha em texto puro — qualquer colaborador do setor pode (não só
// o coordenador), mas cada revelação fica registrada em BpoCredentialView
// (auditoria de acesso, informação sensível).
export async function revelarCredencial(id: string): Promise<{ error: string } | { password: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SECTOR)) return { error: "Sem permissão para ver esta credencial." };

  const prisma = getPrisma();
  const credential = await prisma.bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { passwordEnc: true } });
  if (!credential) return { error: "Credencial não encontrada." };

  let password: string;
  try {
    password = decryptSecret(credential.passwordEnc);
  } catch (err) {
    console.error("[revelarCredencial]", err);
    return { error: "Erro ao decriptar a senha." };
  }

  await prisma.bpoCredentialView.create({
    data: { tenantId: ctx.tenantId, credentialId: id, userId: ctx.userId },
  });

  return { password };
}
