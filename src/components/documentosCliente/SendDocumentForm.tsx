"use client";

import { useActionState } from "react";
import type { ClientDocumentState } from "@/app/(app)/empresas/[id]/documentos-cliente/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmailChipsInput } from "@/components/documentosCliente/EmailChipsInput";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

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
        <Aviso>{state.error}</Aviso>
      )}
      {state && "success" in state && state.success && (
        <Aviso tom="sucesso">Documento enviado.</Aviso>
      )}

      <Checkbox
        name="useCompanyEmail"
        defaultChecked={!!companyEmail}
        disabled={!companyEmail}
        label={companyEmail ? `Enviar para ${companyEmail} (e-mail cadastrado da empresa)` : "Empresa sem e-mail cadastrado"}
      />

      <CampoForm label="E-mails avulsos" htmlFor="extraEmails" helper="Digite um e-mail e aperte Enter ou vírgula para adicionar.">
        <EmailChipsInput id="extraEmails" name="extraEmails" />
      </CampoForm>

      <Button
        variant="primary"
        size="md"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Enviando…" : "Enviar por e-mail"}
      </Button>
    </form>
  );
}
