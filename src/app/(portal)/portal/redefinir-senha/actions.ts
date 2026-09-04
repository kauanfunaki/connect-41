"use server";

import { getPrisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/passwordReset";

export type EstadoDaRedefinicao = { error: string } | { success: true } | null;

// Espelho de /login/redefinir-senha, para o cliente. Rota separada porque a
// tabela é outra — e é justamente o que impede um token de portal de trocar a
// senha de uma conta interna, e vice-versa.
export async function redefinirSenhaDoPortal(
  _anterior: EstadoDaRedefinicao,
  form: FormData
): Promise<EstadoDaRedefinicao> {
  const token = String(form.get("token") ?? "");
  const senha = String(form.get("senha") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");

  if (!token) return { error: "Link inválido." };
  if (senha.length < 8) return { error: "A senha precisa ter ao menos 8 caracteres." };
  if (senha !== confirmacao) return { error: "As senhas não coincidem." };

  const consumido = await consumePasswordResetToken(token);
  if (!consumido) return { error: "Este link expirou ou já foi usado. Solicite uma nova redefinição." };
  if (consumido.subject !== "PORTAL_USER") {
    return { error: "Este link é de uma conta interna, não do portal." };
  }

  const prisma = getPrisma();
  // Reconfirma que a conta segue ativa: o token pode ter sido emitido antes de
  // uma desativação, e não deve reativar o acesso por essa via.
  const conta = await prisma.portalUser.findUnique({
    where: { id: consumido.id },
    select: { active: true },
  });
  if (!conta?.active) return { error: "Este link expirou ou já foi usado. Solicite uma nova redefinição." };

  await prisma.portalUser.update({
    where: { id: consumido.id },
    data: { passwordHash: await hashPassword(senha) },
  });

  return { success: true };
}
