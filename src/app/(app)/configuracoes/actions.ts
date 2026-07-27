"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/sessions";
import { logAudit } from "@/lib/audit";

// Conta do próprio usuário. Tudo aqui é escopado a ctx.userId — nunca a um id
// vindo do formulário — então SECTOR_USER e READONLY também podem usar: não é
// gerenciamento de usuários (isso é /admin/usuarios), é a própria conta.

export type PerfilState = { error: string } | { success: true } | null;

export async function atualizarMeuPerfil(_prev: PerfilState, form: FormData): Promise<PerfilState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome é obrigatório." };
  if (name.length > 120) return { error: "Nome muito longo (máximo 120 caracteres)." };

  try {
    const prisma = getPrisma();
    await prisma.user.update({ where: { id: ctx.userId }, data: { name } });
  } catch (err) {
    console.error("[atualizarMeuPerfil]", err);
    return { error: "Erro ao salvar o perfil. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.self_update",
    entityType: "User",
    entityId: ctx.userId,
    metadata: { name },
  });

  // O nome aparece no cabeçalho (ProfileMenu), montado no layout — sem
  // revalidar a raiz do grupo o menu continuaria com o nome antigo.
  revalidatePath("/", "layout");
  return { success: true };
}

// Sucesso aqui derruba a sessão: `revokeAllUserSessions` invalida todos os
// refresh tokens, inclusive o deste navegador (o cookie de refresh tem path
// /api/auth, então esta action não tem como reconhecer e poupar a sessão
// atual). O formulário trata `loggedOut` chamando /api/auth/logout e mandando
// pro login, em vez de deixar o usuário descobrir sozinho daqui a 15min.
export type TrocaSenhaState = { error: string } | { loggedOut: true } | null;

export async function alterarMinhaSenha(_prev: TrocaSenhaState, form: FormData): Promise<TrocaSenhaState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };

  const currentPassword = (form.get("currentPassword") as string) ?? "";
  const newPassword = (form.get("newPassword") as string) ?? "";
  const confirmPassword = (form.get("confirmPassword") as string) ?? "";

  if (!currentPassword) return { error: "Informe a senha atual." };
  if (newPassword.length < 8) return { error: "A nova senha deve ter ao menos 8 caracteres." };
  if (newPassword !== confirmPassword) return { error: "A confirmação não confere com a nova senha." };
  if (newPassword === currentPassword) return { error: "A nova senha precisa ser diferente da atual." };

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId },
    select: { passwordHash: true },
  });
  if (!user) return { error: "Usuário não encontrado." };

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { error: "Senha atual incorreta." };

  try {
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  } catch (err) {
    console.error("[alterarMinhaSenha]", err);
    return { error: "Erro ao alterar a senha. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.password_change",
    entityType: "User",
    entityId: ctx.userId,
  });

  await revokeAllUserSessions(ctx.userId);

  return { loggedOut: true };
}
