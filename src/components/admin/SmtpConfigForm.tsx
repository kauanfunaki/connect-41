"use client";

import { useRef, useState, useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { atualizarSmtp, testarConexaoSmtp, type SmtpConfigState } from "@/app/(app)/admin/tenant/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Aviso } from "@/components/ui/Aviso";

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
        <Aviso>{state.error}</Aviso>
      )}
      {state && "success" in state && state.success && (
        <Aviso tom="sucesso">Configuração de e-mail salva.</Aviso>
      )}
      {testResult && (
        <Aviso tom={testResult.ok ? "sucesso" : "perigo"}>
          {testResult.message}
        </Aviso>
      )}

      {/* Servidor, autenticação e remetente em seções: eram quatro blocos com
          espaçamentos diferentes, e a porta ocupava um terço da linha. */}
      <div>
        <FormSection title="Servidor">
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_8rem]">
            <CampoForm label="Host SMTP" htmlFor="host" required>
              <Input id="host" name="host" type="text" required defaultValue={defaultValues?.host} placeholder="mail.suaempresa.com.br" />
            </CampoForm>
            <CampoForm label="Porta" htmlFor="port" required>
              <Input id="port" name="port" type="number" required min={1} max={65535} defaultValue={defaultValues?.port ?? 587} />
            </CampoForm>
          </FieldGrid>
          <Checkbox id="secure" name="secure" defaultChecked={defaultValues?.secure ?? true} label="Conexão segura (TLS/SSL — recomendado, geralmente porta 465)" />
        </FormSection>

        <FormSection title="Autenticação">
          <FieldGrid>
            <CampoForm label="Usuário" htmlFor="username" required>
              <Input id="username" name="username" type="text" required defaultValue={defaultValues?.username} placeholder="usuario@suaempresa.com.br" />
            </CampoForm>
            <CampoForm
              label="Senha"
              htmlFor="password"
              required={!hasConfig}
              helper={hasConfig ? "Deixe em branco para manter a senha já salva." : undefined}
            >
              <CampoDeSenha id="password" name="password" required={!hasConfig} placeholder={hasConfig ? "••••••••" : ""} />
            </CampoForm>
          </FieldGrid>
        </FormSection>

        <FormSection title="Remetente">
          <FieldGrid>
            <CampoForm label="Nome de exibição" htmlFor="fromName" required helper="Aparece como remetente no e-mail do cliente.">
              <Input id="fromName" name="fromName" type="text" required defaultValue={defaultValues?.fromName} placeholder="Escritório Contábil" />
            </CampoForm>
            <CampoForm label="E-mail de remetente" htmlFor="fromEmail" required>
              <Input id="fromEmail" name="fromEmail" type="email" required defaultValue={defaultValues?.fromEmail} placeholder="documentos@suaempresa.com.br" />
            </CampoForm>
          </FieldGrid>
        </FormSection>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
        <Button type="button" variant="secondary" onClick={handleTest} disabled={isTesting}>
          {isTesting ? "Testando…" : "Testar conexão"}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
