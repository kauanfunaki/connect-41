import { notFound } from "next/navigation";
import { Video, Check } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { isMicrosoftConfigured } from "@/lib/integrations/microsoft";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { DisconnectButton } from "@/components/admin/DisconnectButton";
import { desconectarIntegracao } from "./actions";

const ERROR_LABEL: Record<string, string> = {
  "sem-permissao": "Sem permissão para conectar integrações.",
  "google-nao-configurado": "Integração com Google ainda não foi configurada pela 41 Tech (faltam credenciais no servidor).",
  "microsoft-nao-configurado": "Integração com Microsoft ainda não foi configurada pela 41 Tech (faltam credenciais no servidor).",
  "google-cancelado": "Conexão com Google cancelada.",
  "microsoft-cancelado": "Conexão com Microsoft cancelada.",
  "google-estado-invalido": "Sessão de conexão expirou. Tente novamente.",
  "microsoft-estado-invalido": "Sessão de conexão expirou. Tente novamente.",
  "google-falha-conexao": "Falha ao conectar com o Google. Tente novamente.",
  "microsoft-falha-conexao": "Falha ao conectar com a Microsoft. Tente novamente.",
};

export default async function IntegracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { error, connected } = await searchParams;
  const ctx = await getAuthContext();
  if (!canManageMeetings(ctx)) notFound();

  const prisma = getPrisma();
  const accounts = await prisma.oAuthAccount.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId } });
  const google = accounts.find((a) => a.provider === "GOOGLE");
  const microsoft = accounts.find((a) => a.provider === "MICROSOFT");

  return (
    <PageContainer variant="narrow">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Integrações</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Conecte sua conta pessoal para agendar reuniões (Google Meet / Microsoft Teams) direto
          dos itens do Kanban. Só coordenadores e administradores veem esta tela.
        </p>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-danger bg-danger-bg border border-danger/30 rounded-lg px-3 py-2">
          {ERROR_LABEL[error] ?? "Erro ao conectar integração."}
        </p>
      )}
      {connected && (
        <p className="mb-4 text-[13px] text-success bg-success-bg border border-success/30 rounded-lg px-3 py-2">
          Conta {connected === "google" ? "Google" : "Microsoft"} conectada com sucesso.
        </p>
      )}

      <div className="space-y-4">
        <Card className={`p-5 flex items-center justify-between gap-4 ${!isGoogleConfigured() ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-brand-subtle text-brand flex items-center justify-center flex-shrink-0">
              <Video size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-fg">Google Calendar / Meet</p>
              {!isGoogleConfigured() ? (
                <p className="text-[12px] text-fg-muted">
                  Indisponível — credenciais do Google não configuradas no servidor (GOOGLE_CLIENT_ID/SECRET)
                  {google ? ". Uma conexão salva existe, mas não pode ser usada até isso ser configurado." : ""}
                </p>
              ) : google ? (
                <p className="text-[12px] text-success flex items-center gap-1">
                  <Check size={12} /> Conectado {google.accountEmail ? `como ${google.accountEmail}` : ""}
                </p>
              ) : (
                <p className="text-[12px] text-fg-muted">Não conectado</p>
              )}
            </div>
          </div>
          {isGoogleConfigured() &&
            (google ? (
              <DisconnectButton action={desconectarIntegracao.bind(null, "GOOGLE")} />
            ) : (
              <a
                href="/api/integrations/google/connect"
                className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors inline-flex items-center flex-shrink-0"
              >
                Conectar
              </a>
            ))}
        </Card>

        <Card className={`p-5 flex items-center justify-between gap-4 ${!isMicrosoftConfigured() ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-brand-subtle text-brand flex items-center justify-center flex-shrink-0">
              <Video size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-fg">Microsoft Teams / Outlook</p>
              {!isMicrosoftConfigured() ? (
                <p className="text-[12px] text-fg-muted">
                  Indisponível — credenciais da Microsoft não configuradas no servidor (MICROSOFT_CLIENT_ID/SECRET)
                  {microsoft ? ". Uma conexão salva existe, mas não pode ser usada até isso ser configurado." : ""}
                </p>
              ) : microsoft ? (
                <p className="text-[12px] text-success flex items-center gap-1">
                  <Check size={12} /> Conectado {microsoft.accountEmail ? `como ${microsoft.accountEmail}` : ""}
                </p>
              ) : (
                <p className="text-[12px] text-fg-muted">Não conectado</p>
              )}
            </div>
          </div>
          {isMicrosoftConfigured() &&
            (microsoft ? (
              <DisconnectButton action={desconectarIntegracao.bind(null, "MICROSOFT")} />
            ) : (
              <a
                href="/api/integrations/microsoft/connect"
                className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors inline-flex items-center flex-shrink-0"
              >
                Conectar
              </a>
            ))}
        </Card>
      </div>
    </PageContainer>
  );
}
