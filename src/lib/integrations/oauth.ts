import { getPrisma } from "@/lib/prisma";
import { isFullWrite, type AuthContext } from "@/lib/auth/context";
import { refreshGoogleToken } from "@/lib/integrations/google";
import { refreshMicrosoftToken } from "@/lib/integrations/microsoft";
import type { MeetingProvider } from "@/generated/prisma/enums";

// Só coordenadores (SECTOR_ADMIN) e admins conectam a própria conta — usuários
// comuns não fazem reuniões como parte do trabalho (decisão do levantamento).
export function canManageMeetings(ctx: AuthContext): boolean {
  return isFullWrite(ctx.role) || ctx.role === "SECTOR_ADMIN";
}

// Atrás do proxy reverso do EasyPanel, req.url reporta o host interno do
// container (ex.: 0.0.0.0:80) em vez do domínio público — usar isso pra montar
// redirects gera URLs quebradas. APP_PUBLIC_URL é a fonte canônica do domínio
// público do app (troca de domínio = trocar UMA env); o redirect URI do
// provedor fica só como fallback, pois pode apontar pro domínio antigo
// enquanto o cadastro no Google Cloud/Azure não é atualizado.
export function getPublicOrigin(provider: MeetingProvider): string {
  const publicUrl = process.env.APP_PUBLIC_URL;
  if (publicUrl) {
    try {
      return new URL(publicUrl).origin;
    } catch {
      // valor malformado — cai pro fallback abaixo
    }
  }
  const redirectUri =
    provider === "GOOGLE" ? process.env.GOOGLE_REDIRECT_URI : process.env.MICROSOFT_REDIRECT_URI;
  return redirectUri ? new URL(redirectUri).origin : "";
}

// Retorna um access token válido para o usuário+provider, renovando via
// refresh_token se estiver vencido (ou a 2min de vencer, margem de segurança).
export async function getValidAccessToken(
  tenantId: string,
  userId: string,
  provider: MeetingProvider
): Promise<string | null> {
  const prisma = getPrisma();
  const account = await prisma.oAuthAccount.findFirst({ where: { tenantId, userId, provider } });
  if (!account) return null;

  const expiringSoon = account.expiresAt.getTime() - Date.now() < 2 * 60 * 1000;
  if (!expiringSoon) return account.accessToken;

  // Renovação pode falhar (token revogado no provedor, credenciais trocadas
  // no Cloud Console etc.) — não deixar propagar: isso derrubaria a página
  // inteira do item de Kanban em vez de só bloquear o agendamento com uma
  // mensagem pedindo pra reconectar a conta.
  let refreshed: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    refreshed =
      provider === "GOOGLE"
        ? await refreshGoogleToken(account.refreshToken)
        : await refreshMicrosoftToken(account.refreshToken);
  } catch (err) {
    console.error("[getValidAccessToken] falha ao renovar token", provider, err);
    return null;
  }

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.oAuthAccount.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.access_token,
      // Google só reemite refresh_token às vezes (ex: primeiro consent) — preserva o antigo se não vier um novo.
      refreshToken: refreshed.refresh_token ?? account.refreshToken,
      expiresAt,
    },
  });

  return refreshed.access_token;
}
