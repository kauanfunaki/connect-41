"use client";

import { useRef, useState, useActionState } from "react";
import {
  salvarConexaoChatwoot,
  removerConexaoChatwoot,
  testarConexaoChatwoot,
  sincronizarChatwootAgora,
  type ChatwootConfigState,
} from "@/app/(app)/admin/integracoes/chatwoot-actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  hasConfig: boolean;
  defaultValues?: { baseUrl: string; accountId: string };
  webhookUrl: string | null;
  lastSyncAtLabel: string | null;
};

export function ChatwootConfigForm({ hasConfig, defaultValues, webhookUrl, lastSyncAtLabel }: Props) {
  const [state, formAction, isPending] = useActionState<ChatwootConfigState, FormData>(salvarConexaoChatwoot, null);
  const [removeState, removeAction, isRemoving] = useActionState<ChatwootConfigState, FormData>(
    async () => await removerConexaoChatwoot(),
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTest() {
    if (!formRef.current) return;
    setIsTesting(true);
    setTestResult(null);
    const fd = new FormData(formRef.current);
    const result = await testarConexaoChatwoot({
      baseUrl: (fd.get("baseUrl") as string) ?? "",
      accountId: (fd.get("accountId") as string) ?? "",
      apiToken: (fd.get("apiToken") as string) ?? "",
    });
    setTestResult(
      result.ok ? { ok: true, message: `Conectado — ${result.conversationCount} conversa(s) na conta.` } : { ok: false, message: result.error }
    );
    setIsTesting(false);
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncResult(null);
    const result = await sincronizarChatwootAgora();
    setSyncResult(result.ok ? { ok: true, message: result.message } : { ok: false, message: result.error });
    setIsSyncing(false);
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} className="space-y-4">
        {state && "error" in state && state.error && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>
        )}
        {state && "success" in state && state.success && (
          <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">Conexão com o Chatwoot salva.</p>
        )}
        {removeState && "success" in removeState && removeState.success && (
          <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">Conexão removida.</p>
        )}
        {testResult && (
          <p className={`text-[13px] rounded-md px-3 py-2 border ${testResult.ok ? "text-success bg-success/8 border-success/20" : "text-danger bg-danger/8 border-danger/20"}`}>
            {testResult.message}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="URL base" htmlFor="baseUrl" required helper="Ex: https://app.chatwoot.com ou sua instância self-hosted.">
            <Input id="baseUrl" name="baseUrl" type="text" required defaultValue={defaultValues?.baseUrl ?? ""} placeholder="https://app.chatwoot.com" />
          </CampoForm>
          <CampoForm label="ID da conta" htmlFor="accountId" required>
            <Input id="accountId" name="accountId" type="text" required defaultValue={defaultValues?.accountId ?? ""} placeholder="1" />
          </CampoForm>
        </div>

        <CampoForm
          label="Token de API (api_access_token)"
          htmlFor="apiToken"
          required={!hasConfig}
          helper={hasConfig ? "Deixe em branco para manter o token já salvo." : "Perfil → Configurações de acesso, no Chatwoot."}
        >
          <Input id="apiToken" name="apiToken" type="password" required={!hasConfig} placeholder={hasConfig ? "••••••••" : "cw_..."} />
        </CampoForm>

        <CampoForm
          label="Webhook secret"
          htmlFor="webhookSecret"
          required={!hasConfig}
          helper={
            hasConfig
              ? "Deixe em branco para manter o segredo já salvo."
              : "Gerado pelo próprio Chatwoot ao criar o webhook (tela Configurações → Integrações → Webhooks) — cole aqui o valor exibido lá."
          }
        >
          <Input id="webhookSecret" name="webhookSecret" type="password" required={!hasConfig} placeholder={hasConfig ? "••••••••" : ""} />
        </CampoForm>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="h-9 px-4 rounded-md border border-border-strong text-fg text-[13px] font-medium hover:bg-surface-hover disabled:opacity-60 transition-colors"
          >
            {isTesting ? "Testando…" : "Testar conexão"}
          </button>
        </div>
      </form>

      {hasConfig && webhookUrl && (
        <div className="pt-3 border-t border-border">
          <p className="text-[12.5px] text-fg-muted mb-1.5">
            Cole esta URL na tela de Webhooks do Chatwoot (Configurações → Integrações → Webhooks) para receber
            atualizações incrementais:
          </p>
          <code className="block text-[12px] bg-surface-hover border border-border rounded-md px-3 py-2 break-all">{webhookUrl}</code>
        </div>
      )}

      {hasConfig && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="h-8 px-3 rounded-md border border-border-strong text-fg text-[12.5px] font-medium hover:bg-surface-hover disabled:opacity-60 transition-colors"
            >
              {isSyncing ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            {lastSyncAtLabel && <span className="text-[12px] text-fg-muted">Última sincronização: {lastSyncAtLabel}</span>}
          </div>
          {syncResult && (
            <p className={`mt-2 text-[12.5px] rounded-md px-3 py-2 border ${syncResult.ok ? "text-success bg-success/8 border-success/20" : "text-danger bg-danger/8 border-danger/20"}`}>
              {syncResult.message}
            </p>
          )}
        </div>
      )}

      {hasConfig && (
        <form action={removeAction} className="pt-1 border-t border-border">
          <button
            type="submit"
            disabled={isRemoving}
            className="mt-3 h-8 px-3 rounded-md text-[12.5px] font-medium text-danger hover:bg-danger/8 disabled:opacity-60 transition-colors"
          >
            {isRemoving ? "Removendo…" : "Remover conexão"}
          </button>
        </form>
      )}
    </div>
  );
}
