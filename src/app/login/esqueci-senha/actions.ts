"use server";

import { createHubAccessRequest } from "@/lib/hub";
import { getPrisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";

export type EsqueciSenhaState = { error: string } | { success: true } | null;

// Se o tenant do usuário tem SMTP configurado, fecha o ciclo sozinho
// (token de uso único, e-mail real). Caso contrário — ou se o e-mail não
// corresponde a nenhuma conta — cai no fallback de sempre (chamado no Hub),
// igual ao comportamento anterior. O retorno pro cliente é sempre o mesmo
// "sucesso" genérico nos dois casos, pra não revelar se o e-mail existe.
export async function solicitarRedefinicaoSenha(
  _prev: EsqueciSenhaState,
  form: FormData
): Promise<EsqueciSenhaState> {
  const nome = (form.get("nome") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const mensagem = (form.get("mensagem") as string)?.trim();

  if (!nome) return { error: "Informe seu nome." };
  if (!email) return { error: "Informe seu e-mail." };

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({ where: { email, active: true } });

  // Cliente do portal usa o MESMO formulário — foi a decisão de 2026-09-03, e
  // evita que o cliente tenha de saber que existem duas telas de recuperação.
  // A conta interna vence quando o e-mail existe nas duas: quem tem as duas é
  // gente da 41 com um acesso de cliente, e o caminho interno é o que ela usa.
  const portalUser = user
    ? null
    : await prisma.portalUser.findFirst({ where: { email, active: true } });

  if (portalUser) {
    const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: portalUser.tenantId } });
    if (smtp) {
      const token = await createPasswordResetToken(portalUser.id, "PORTAL_USER");
      const sent = await sendPasswordResetEmail({
        tenantId: portalUser.tenantId,
        to: email,
        resetToken: token,
        destino: "portal",
      });
      if (sent.ok) return { success: true };
    }
  }

  if (user) {
    const smtpConfigured = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: user.tenantId } });
    if (smtpConfigured) {
      const token = await createPasswordResetToken(user.id);
      const sent = await sendPasswordResetEmail({ tenantId: user.tenantId, to: email, resetToken: token });
      if (sent.ok) return { success: true };
      // Falha ao enviar (SMTP mal configurado, etc.) — cai no fallback do Hub abaixo.
    }
  }

  const result = await createHubAccessRequest({
    tipo: "SENHA",
    nome,
    email,
    mensagem,
  });

  if (!result.ok) return { error: result.error };
  return { success: true };
}
