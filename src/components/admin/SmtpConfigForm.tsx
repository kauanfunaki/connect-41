"use client";

import { useRef, useState, useActionState } from "react";
import { atualizarSmtp, testarConexaoSmtp, type SmtpConfigState } from "@/app/(app)/admin/tenant/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

type Props = {
  hasConfig: boolean;
  defaultValues?: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
  };
};

export function SmtpConfigForm({ hasConfig, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState<SmtpConfigState, FormData>(atualizarSmtp, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTest() {
    if (!formRef.current) return;
    setIsTesting(true);
    setTestResult(null);
    const fd = new FormData(formRef.current);
    const result = await testarConexaoSmtp({
      host: (fd.get("host") as string)?.trim(),
      port: Number(fd.get("port")),
      secure: fd.get("secure") === "on",
      username: (fd.get("username") as string)?.trim(),
      password: (fd.get("password") as string) ?? "",
    });
    setTestResult(result.ok ? { ok: true, message: "Conexão bem-sucedida." } : { ok: false, message: result.error });
    setIsTesting(false);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {state && "error" in state && state.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">Configuração de e-mail salva.</p>
      )}
      {testResult && (
        <p className={`text-[13px] rounded-md px-3 py-2 border ${testResult.ok ? "text-success bg-success/8 border-success/20" : "text-danger bg-danger/8 border-danger/20"}`}>
          {testResult.message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <CampoForm label="Host SMTP" htmlFor="host" required>
            <Input id="host" name="host" type="text" required defaultValue={defaultValues?.host} placeholder="mail.suaempresa.com.br" />
          </CampoForm>
        </div>
        <CampoForm label="Porta" htmlFor="port" required>
          <Input id="port" name="port" type="number" required min={1} max={65535} defaultValue={defaultValues?.port ?? 587} />
        </CampoForm>
      </div>

      <div className="h-9 flex items-center">
        <Checkbox id="secure" name="secure" defaultChecked={defaultValues?.secure ?? true} label="Conexão segura (TLS/SSL — recomendado, geralmente porta 465)" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Usuário" htmlFor="username" required>
          <Input id="username" name="username" type="text" required defaultValue={defaultValues?.username} placeholder="usuario@suaempresa.com.br" />
        </CampoForm>
        <CampoForm
          label="Senha"
          htmlFor="password"
          required={!hasConfig}
          helper={hasConfig ? "Deixe em branco para manter a senha já salva." : undefined}
        >
          <Input id="password" name="password" type="password" required={!hasConfig} placeholder={hasConfig ? "••••••••" : ""} />
        </CampoForm>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
        <CampoForm label="Nome de exibição" htmlFor="fromName" required helper="Aparece como remetente no e-mail do cliente.">
          <Input id="fromName" name="fromName" type="text" required defaultValue={defaultValues?.fromName} placeholder="Escritório Contábil" />
        </CampoForm>
        <CampoForm label="E-mail de remetente" htmlFor="fromEmail" required>
          <Input id="fromEmail" name="fromEmail" type="email" required defaultValue={defaultValues?.fromEmail} placeholder="documentos@suaempresa.com.br" />
        </CampoForm>
      </div>

      <div className="flex items-center gap-3 pt-2">
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
  );
}
