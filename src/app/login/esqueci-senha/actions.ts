"use server";

import { getPrisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";
import { MAX_CONTAS_POR_EMAIL } from "@/lib/auth/entradaDaEquipe";

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
  const users = await prisma.user.findMany({
    where: { email, active: true },
    orderBy: { createdAt: "asc" },
    take: MAX_CONTAS_POR_EMAIL,
    select: { id: true, tenantId: true, tenant: { select: { name: true } } },
  });

  // A conta interna vence quando o e-mail existe nas duas: quem tem as duas é
  // gente da 41 com um acesso de cliente, e o caminho interno é o que ela usa.
  //
  // O mesmo e-mail pode ter conta da equipe em mais de um escritório
  // (06/10/2026). Até então ia um link só, para a conta que o banco devolvesse
  // primeiro — a senha trocada podia ser a do escritório errado. Agora é a
  // regra do portal: um link por conta, cada um pelo SMTP do escritório dela.
  // O token de redefinição é amarrado ao id da conta, então nenhum link troca a
  // senha de outro escritório; com mais de uma conta, cada e-mail diz de qual
  // escritório é o link. A tela responde o mesmo "sucesso" de sempre — não diz
  // quantas contas existem. Com uma conta só, o e-mail é o de antes.
  if (users.length > 0) {
    const variosEscritorios = users.length > 1;
    for (const user of users) {
      const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: user.tenantId } });
      if (!smtp) {
        console.warn("[esqueci-senha] escritório sem SMTP, link não enviado", { tenantId: user.tenantId });
        continue;
      }
      const token = await createPasswordResetToken(user.id);
      const sent = await sendPasswordResetEmail({
        tenantId: user.tenantId,
        to: email,
        resetToken: token,
        escritorio: variosEscritorios ? user.tenant.name : undefined,
      });
      if (!sent.ok) console.warn("[esqueci-senha] falha ao enviar o link", { tenantId: user.tenantId });
    }
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
