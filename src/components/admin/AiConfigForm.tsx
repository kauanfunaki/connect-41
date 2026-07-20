"use client";

import { useRef, useState, useActionState } from "react";
import { salvarConfigIA, removerConfigIA, testarChaveIA, type AiConfigState } from "@/app/(app)/admin/integracoes/ai-actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { AiProvider } from "@/generated/prisma/enums";

type Props = {
  hasConfig: boolean;
  defaultValues?: {
    provider: AiProvider;
    model: string | null;
  };
};

const PROVIDER_LABEL: Record<AiProvider, string> = {
  ANTHROPIC: "Anthropic (Claude)",
  OPENAI: "OpenAI",
};

export function AiConfigForm({ hasConfig, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState<AiConfigState, FormData>(salvarConfigIA, null);
  const [removeState, removeAction, isRemoving] = useActionState<AiConfigState, FormData>(
    async () => await removerConfigIA(),
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [provider, setProvider] = useState<AiProvider>(defaultValues?.provider ?? "ANTHROPIC");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTest() {
    if (!formRef.current) return;
    setIsTesting(true);
    setTestResult(null);
    const fd = new FormData(formRef.current);
    const result = await testarChaveIA({
      provider: (fd.get("provider") as AiProvider) ?? "ANTHROPIC",
      apiKey: (fd.get("apiKey") as string) ?? "",
    });
    setTestResult(result.ok ? { ok: true, message: "Chave válida." } : { ok: false, message: result.error });
    setIsTesting(false);
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} className="space-y-4">
        {state && "error" in state && state.error && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>
        )}
        {state && "success" in state && state.success && (
          <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">Configuração de IA salva.</p>
        )}
        {removeState && "success" in removeState && removeState.success && (
          <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
            Configuração removida — volta a usar a chave padrão do ambiente (se houver).
          </p>
        )}
        {testResult && (
          <p className={`text-[13px] rounded-md px-3 py-2 border ${testResult.ok ? "text-success bg-success/8 border-success/20" : "text-danger bg-danger/8 border-danger/20"}`}>
            {testResult.message}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="Provedor" htmlFor="provider" required>
            <Select
              id="provider"
              name="provider"
              required
              value={provider}
              onChange={(e) => setProvider(e.target.value as AiProvider)}
            >
              {(Object.keys(PROVIDER_LABEL) as AiProvider[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Modelo (opcional)" htmlFor="model" helper="Deixe em branco para usar o padrão do provedor.">
            <Input
              id="model"
              name="model"
              type="text"
              defaultValue={defaultValues?.model ?? ""}
              placeholder={provider === "ANTHROPIC" ? "claude-opus-4-8" : "gpt-4.1"}
            />
          </CampoForm>
        </div>

        <CampoForm
          label="Chave de API"
          htmlFor="apiKey"
          required={!hasConfig}
          helper={hasConfig ? "Deixe em branco para manter a chave já salva." : "Gere em console.anthropic.com ou platform.openai.com."}
        >
          <Input id="apiKey" name="apiKey" type="password" required={!hasConfig} placeholder={hasConfig ? "••••••••" : "sk-..."} />
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
            {isTesting ? "Testando…" : "Testar chave"}
          </button>
        </div>
      </form>

      {hasConfig && (
        <form action={removeAction} className="pt-1 border-t border-border">
          <button
            type="submit"
            disabled={isRemoving}
            className="mt-3 h-8 px-3 rounded-md text-[12.5px] font-medium text-danger hover:bg-danger/8 disabled:opacity-60 transition-colors"
          >
            {isRemoving ? "Removendo…" : "Remover configuração"}
          </button>
        </form>
      )}
    </div>
  );
}
