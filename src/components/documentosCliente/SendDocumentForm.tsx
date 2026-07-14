"use client";

import { useActionState } from "react";
import type { ClientDocumentState } from "@/app/(app)/empresas/[id]/documentos-cliente/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  action: (prev: ClientDocumentState, form: FormData) => Promise<ClientDocumentState>;
  documentId: string;
  companyId: string;
  companyEmail?: string | null;
};

export function SendDocumentForm({ action, documentId, companyId, companyEmail }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="companyId" value={companyId} />

      {state && "error" in state && state.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">Documento enviado.</p>
      )}

      <Checkbox
        name="useCompanyEmail"
        defaultChecked={!!companyEmail}
        disabled={!companyEmail}
        label={companyEmail ? `Enviar para ${companyEmail} (e-mail cadastrado da empresa)` : "Empresa sem e-mail cadastrado"}
      />

      <CampoForm label="E-mails avulsos" htmlFor="extraEmails" helper="Um por linha ou separados por vírgula — ex.: contador@empresa.com, socio@empresa.com">
        <Textarea id="extraEmails" name="extraEmails" placeholder="contador@empresa.com" />
      </CampoForm>

      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Enviando…" : "Enviar por e-mail"}
      </button>
    </form>
  );
}
