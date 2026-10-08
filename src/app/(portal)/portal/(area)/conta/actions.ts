"use server";

// A senha do cliente em "Minha conta" (12A da página de decisões, 08/10/2026).
//
// ─── Quem entrou pelo Google e "não tem senha" ──────────────────────────────
//
// O banco não guarda se a pessoa tem senha. `passwordHash` é obrigatório, e o
// acesso nasce com o hash de um valor aleatório que ninguém conhece
// (`criarAcessoDoPortal`); o Google só confere o e-mail. "Nunca criei senha"
// e "esqueci a senha" são, para o sistema, a mesma conta com uma senha que a
// pessoa não sabe. Por isso a tela não tenta adivinhar: oferece a troca (com a
// senha atual) e, para quem não a sabe, o link por e-mail — o mesmo da
// redefinição, para o e-mail da conta logada. Criar senha sem a atual, só por
// estar logado, deixaria uma sessão roubada (30 dias com o "lembrar") virar
// senha permanente; o link exige o e-mail, como o Google já exigiu.
//
// ─── Tentativas ─────────────────────────────────────────────────────────────
//
// O login do portal não tem limite de tentativas; aqui há, por conta: a senha
// atual é conferida a cada envio, e sem limite uma sessão aberta num aparelho
// alheio serviria para descobrir a senha por tentativa. O link também tem o
// seu, para o botão não virar uma fila de e-mails.
//
// A sessão do portal não tem token de renovação para revogar (ao contrário da
// equipe, `alterarMinhaSenha`): trocar a senha não derruba quem já está
// dentro, e a pessoa segue na tela.

import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";
import { hit, reset } from "@/lib/rateLimit";
import { problemaDaSenhaNova } from "@/lib/portal/senha";

export type EstadoDaTrocaDeSenha = { erro: string } | { ok: true } | null;
export type EstadoDoLinkDeSenha = { erro: string } | { enviadoPara: string } | null;

const SESSAO_EXPIRADA = "Sessão expirada. Entre de novo no portal.";
const QUINZE_MINUTOS = 15 * 60_000;

/** A conta da sessão, conferida ativa no banco: conta desativada não troca senha. */
async function contaDaSessao() {
  const sessao = await getPortalSession();
  if (!sessao) return null;
  return getPrisma().portalUser.findFirst({
    where: { id: sessao.sub, tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId, active: true },
    select: { id: true, tenantId: true, email: true, passwordHash: true },
  });
}

export async function trocarSenhaDoPortal(_anterior: EstadoDaTrocaDeSenha, form: FormData): Promise<EstadoDaTrocaDeSenha> {
  const conta = await contaDaSessao();
  if (!conta) return { erro: SESSAO_EXPIRADA };

  const atual = String(form.get("atual") ?? "");
  const senha = String(form.get("senha") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");

  if (!atual) return { erro: "Informe a senha atual." };
  const problema = problemaDaSenhaNova(senha, confirmacao);
  if (problema) return { erro: problema };
  if (senha === atual) return { erro: "A senha nova precisa ser diferente da atual." };

  // Conta só o que chega a conferir a senha: erro de digitação na confirmação
  // não gasta tentativa.
  const chave = `portal-troca-de-senha:${conta.id}`;
  if (!hit(chave, 5, QUINZE_MINUTOS).allowed) return { erro: "Muitas tentativas. Tente de novo em alguns minutos." };

  if (!(await verifyPassword(atual, conta.passwordHash))) {
    return { erro: "Senha atual incorreta. Se você entra com o Google e nunca criou uma senha, use o link abaixo." };
  }

  await getPrisma().portalUser.update({
    where: { id: conta.id },
    data: { passwordHash: await hashPassword(senha) },
  });
  reset(chave);
  return { ok: true };
}

/**
 * O link para criar (ou recriar) a senha, mandado ao e-mail da conta logada.
 * Não lê nada do formulário: o destino é sempre o e-mail da sessão.
 */
export async function enviarLinkParaCriarSenha(): Promise<EstadoDoLinkDeSenha> {
  const conta = await contaDaSessao();
  if (!conta) return { erro: SESSAO_EXPIRADA };

  if (!hit(`portal-link-de-senha:${conta.id}`, 3, QUINZE_MINUTOS).allowed) {
    return { erro: "Já mandamos o link há pouco. Confira a caixa de entrada e o spam, ou tente de novo em alguns minutos." };
  }

  // O token é amarrado a esta conta (e não ao e-mail): com o mesmo e-mail em
  // dois clientes, o link troca só a senha deste acesso.
  const token = await createPasswordResetToken(conta.id, "PORTAL_USER");
  const envio = await sendPasswordResetEmail({ tenantId: conta.tenantId, to: conta.email, resetToken: token, destino: "portal" });
  if (!envio.ok) {
    console.warn("[portal/conta] link de senha não saiu", { tenantId: conta.tenantId });
    return { erro: "O e-mail não saiu agora. Tente de novo mais tarde ou fale com o escritório." };
  }
  return { enviadoPara: conta.email };
}
