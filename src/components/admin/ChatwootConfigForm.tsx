"use client";

import { useId, useRef, useState, useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  salvarConexaoChatwoot,
  removerConexaoChatwoot,
  testarConexaoChatwoot,
  sincronizarChatwootAgora,
  type ChatwootConfigState,
} from "@/app/(app)/admin/integracoes/chatwoot-actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Aviso } from "@/components/ui/Aviso";

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
  const idDoRemover = useId();
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
      {/* Primeiro filho, e não o último: escondido no fim, ele faria o
          `space-y` deixar uma sobra de margem embaixo do cartão. */}
      {hasConfig && <form id={idDoRemover} action={removeAction} className="hidden" />}
      <form ref={formRef} action={formAction} className="space-y-4">
        {state && "error" in state && state.error && (
          <Aviso>{state.error}</Aviso>
        )}
        {state && "success" in state && state.success && (
          <Aviso tom="sucesso">Conexão com o Chatwoot salva.</Aviso>
        )}
        {removeState && "success" in removeState && removeState.success && (
          <Aviso tom="sucesso">Conexão removida.</Aviso>
        )}
        {testResult && (
          <Aviso tom={testResult.ok ? "sucesso" : "perigo"}>
            {testResult.message}
          </Aviso>
        )}

        {/* O ID da conta é um número curto: coluna estreita ao lado da URL.
            Token e segredo do webhook, os dois campos de senha, lado a lado. */}
        <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_10rem]">
          <CampoForm label="URL base" htmlFor="baseUrl" required helper="Ex: https://app.chatwoot.com ou sua instância self-hosted.">
            <Input id="baseUrl" name="baseUrl" type="text" required defaultValue={defaultValues?.baseUrl ?? ""} placeholder="https://app.chatwoot.com" />
          </CampoForm>
          <CampoForm label="ID da conta" htmlFor="accountId" required>
            <Input id="accountId" name="accountId" type="text" required defaultValue={defaultValues?.accountId ?? ""} placeholder="1" />
          </CampoForm>
        </FieldGrid>

        <FieldGrid>
          <CampoForm
            label="Token de API (api_access_token)"
            htmlFor="apiToken"
            required={!hasConfig}
            helper={hasConfig ? "Deixe em branco para manter o token já salvo." : "Perfil → Configurações de acesso, no Chatwoot."}
          >
            <CampoDeSenha id="apiToken" name="apiToken" required={!hasConfig} placeholder={hasConfig ? "••••••••" : "cw_..."} />
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
            <CampoDeSenha id="webhookSecret" name="webhookSecret" required={!hasConfig} placeholder={hasConfig ? "••••••••" : ""} />
          </CampoForm>
        </FieldGrid>

        {/* Rodapé único, como o da IA: remover à esquerda, separado; testar e
            salvar à direita. O botão de remover envia o formulário vazio do
            fim do componente (atributo `form`). */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
          {hasConfig && (
            <Button variant="danger" type="submit" form={idDoRemover} disabled={isRemoving} className="mr-auto">
              {isRemoving ? "Removendo…" : "Remover conexão"}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handleTest} disabled={isTesting}>
            {isTesting ? "Testando…" : "Testar conexão"}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>

      {hasConfig && webhookUrl && (
        <div className="pt-4 border-t border-border">
          <p className="text-[length:var(--fs-helper)] text-fg-muted mb-1.5">
            Cole esta URL na tela de Webhooks do Chatwoot (Configurações → Integrações → Webhooks) para receber
            atualizações incrementais:
          </p>
          <code className="block text-[12px] bg-surface-hover border border-border rounded-md px-3 py-2 break-all">{webhookUrl}</code>
        </div>
      )}

      {hasConfig && (
        <div className="pt-4 border-t border-border">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
            {lastSyncAtLabel && (
              <span className="text-[length:var(--fs-helper)] text-fg-muted">Última sincronização: {lastSyncAtLabel}</span>
            )}
          </div>
          {syncResult && (
            <Aviso tom={syncResult.ok ? "sucesso" : "perigo"} className="mt-2">
              {syncResult.message}
            </Aviso>
          )}
        </div>
      )}
    </div>
  );
}
