"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canActOnSector, podeExcluir } from "@/lib/auth/context";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { pick } from "@/lib/forms";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import { isModuleEnabled } from "@/lib/modules";

export type BpoCredencialState = ActionState;

// Cofre por setor (05/11/2026): cada credencial é de um setor
// (`BpoCredential.sectorCode`), e quem ver, revelar, editar ou excluir é
// decidido pelo setor DELA — e não mais pelo setor que opera a tela. Criar
// recebe o setor da tela (`setorDaTelaDoApoio`), conferido de novo aqui.
const MODULE = "bpo_senhas";

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
  setor: string,
  _prev: BpoCredencialState,
  form: FormData
): Promise<BpoCredencialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!setor || !(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "O Repositório de senhas está desligado." };
  if (!canManageSector(ctx, setor)) return { error: "Só a coordenação do setor pode cadastrar credenciais." };

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
        sectorCode: setor,
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

  revalidatePath("/senhas");
  return null;
}

export async function atualizarCredencial(
  id: string,
  _prev: BpoCredencialState,
  form: FormData
): Promise<BpoCredencialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const existing = await getPrisma().bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, sectorCode: true } });
  if (!existing) return { error: "Credencial não encontrada." };
  if (!canManageSector(ctx, existing.sectorCode)) return { error: "Só a coordenação do setor pode editar credenciais." };

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

  revalidatePath("/senhas");
  return null;
}

export async function excluirCredencial(id: string): Promise<void> {
  const ctx = await getAuthContext();
  // Excluir senha do cofre: só o administrador (13/10/2026). Era o gestor do BPO.
  if (!ctx.tenantId || !ctx.userId || !podeExcluir(ctx)) return;

  const prisma = getPrisma();
  const existing = await prisma.bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, title: true, sectorCode: true } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

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

  revalidatePath("/senhas");
}

// Revela a senha em texto puro — qualquer colaborador do setor pode (não só
// o coordenador), mas cada revelação fica registrada em BpoCredentialView
// (auditoria de acesso, informação sensível).
export async function revelarCredencial(id: string): Promise<{ error: string } | { password: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const credential = await prisma.bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { passwordEnc: true, sectorCode: true } });
  if (!credential) return { error: "Credencial não encontrada." };
  // A senha de um setor não se revela a quem é de outro (cofre por setor, 05/11/2026).
  if (!canActOnSector(ctx, credential.sectorCode)) return { error: "Sem permissão para ver esta credencial." };

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
