"use server";

import { getPrisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";

export type EsqueciSenhaState = { error: string } | { success: true } | null;

// Recuperação de senha da equipe e do cliente do portal, numa tela só.
//
// Só manda o link. Até 01/10/2026, e-mail sem conta (ou escritório sem SMTP)
// virava chamado no Hub da 41 Tech — e o formulário público, com nome e
// mensagem livres, passou a receber propaganda. Sem o chamado, a tela pede só o
// e-mail, e a resposta é sempre o mesmo "sucesso" genérico, exista a conta ou
// não, para não revelar quem tem acesso.
export async function solicitarRedefinicaoSenha(
  _prev: EsqueciSenhaState,
  form: FormData
): Promise<EsqueciSenhaState> {
  const email = (form.get("email") as string | null)?.trim().toLowerCase();
  if (!email) return { error: "Informe seu e-mail." };

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({ where: { email, active: true } });

  // A conta interna vence quando o e-mail existe nas duas: quem tem as duas é
  // gente da 41 com um acesso de cliente, e o caminho interno é o que ela usa.
  if (user) {
    const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: user.tenantId } });
    if (!smtp) {
      console.warn("[esqueci-senha] escritório sem SMTP, link não enviado", { tenantId: user.tenantId });
      return { success: true };
    }
    const token = await createPasswordResetToken(user.id);
    const sent = await sendPasswordResetEmail({ tenantId: user.tenantId, to: email, resetToken: token });
    if (!sent.ok) console.warn("[esqueci-senha] falha ao enviar o link", { tenantId: user.tenantId });
    return { success: true };
  }

  // O mesmo e-mail pode ter conta de portal em mais de um cliente (o contador
  // que atende duas empresas). Até 16/09 ia um link só, para a conta que o
  // banco devolvesse primeiro — e a pessoa redefinia a senha do cliente errado.
  // Agora vai um link por conta, cada um pelo SMTP do escritório daquela conta,
  // que é o que diz a ela de onde o e-mail veio.
  const portalUsers = await prisma.portalUser.findMany({ where: { email, active: true }, take: 10 });
  for (const portalUser of portalUsers) {
    const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: portalUser.tenantId } });
    if (!smtp) {
      console.warn("[esqueci-senha] escritório sem SMTP, link não enviado", { tenantId: portalUser.tenantId });
      continue;
    }
    const token = await createPasswordResetToken(portalUser.id, "PORTAL_USER");
    const sent = await sendPasswordResetEmail({
      tenantId: portalUser.tenantId,
      to: email,
      resetToken: token,
      destino: "portal",
    });
    if (!sent.ok) console.warn("[esqueci-senha] falha ao enviar o link", { tenantId: portalUser.tenantId });
  }
  return { success: true };
}
