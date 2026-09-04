"use server";

import { hashPassword } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/passwordReset";
import { revokeAllUserSessions } from "@/lib/auth/sessions";
import { getPrisma } from "@/lib/prisma";

export type RedefinirSenhaState = { error: string } | { success: true } | null;

export async function redefinirSenha(
  _prev: RedefinirSenhaState,
  form: FormData
): Promise<RedefinirSenhaState> {
  const token = form.get("token") as string | null;
  const password = form.get("password") as string | null;
  const confirmPassword = form.get("confirmPassword") as string | null;

  if (!token) return { error: "Link inválido." };
  if (!password || password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirmPassword) return { error: "As senhas não coincidem." };

  const consumido = await consumePasswordResetToken(token);
  if (!consumido) return { error: "Este link expirou ou já foi usado. Solicite uma nova redefinição." };
  // Token de portal não redefine senha interna, mesmo chegando nesta rota. O
  // link do portal aponta para /portal/redefinir-senha; um token colado aqui à
  // mão cai nesta recusa em vez de procurar um id de cliente na tabela `users`.
  if (consumido.subject !== "USER") {
    return { error: "Este link é do portal do cliente. Use o endereço que veio no e-mail." };
  }
  const userId = consumido.id;

  const prisma = getPrisma();
  // Reconfirma que a conta segue ativa na hora de consumir o token — o token
  // pode ter sido emitido antes de uma desativação (ex.: suspeita de conta
  // comprometida) e não deve conseguir reativar o acesso por essa via.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!user?.active) return { error: "Este link expirou ou já foi usado. Solicite uma nova redefinição." };

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Trocar a senha derruba todas as sessões ativas (mesmo racional de
  // revokeAllUserSessions em desativação de usuário) — inclusive a de quem
  // porventura tinha acesso indevido à conta antes da troca.
  await revokeAllUserSessions(userId);

  return { success: true };
}
