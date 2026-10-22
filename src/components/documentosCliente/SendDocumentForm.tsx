"use client";

import { useActionState } from "react";
import type { ClientDocumentState } from "@/app/(app)/solicitacoes/envios/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmailChipsInput } from "@/components/documentosCliente/EmailChipsInput";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Select } from "@/components/ui/Select";
import { OPCOES_DO_LEMBRETE } from "@/lib/envios/lembrete";

type Props = {
  action: (prev: ClientDocumentState, form: FormData) => Promise<ClientDocumentState>;
  documentId: string;
  companyId: string;
  companyEmail?: string | null;
  /**
   * O lembrete de não lido do envio (22/10/2026): o prazo atual, para o campo
   * vir escolhido. `false` quando o lembrete já saiu — não se programa outro.
   */
  lembrete?: { dias: number | null } | false;
};

export function SendDocumentForm({ action, documentId, companyId, companyEmail, lembrete }: Props) {
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

      {lembrete !== false && (
        <CampoForm label="Lembrete de não lido" htmlFor="reminderDays" helper="Se ninguém do cliente abrir no prazo, sai um lembrete só (e-mail e aviso no portal).">
          <Select id="reminderDays" name="reminderDays" defaultValue={lembrete?.dias ? String(lembrete.dias) : ""}>
            {OPCOES_DO_LEMBRETE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </CampoForm>
      )}

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
