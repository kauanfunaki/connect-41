"use client";

import { useActionState } from "react";
import type { ClientDocumentState } from "@/app/(app)/empresas/[id]/documentos-cliente/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

type Props = {
  action: (prev: ClientDocumentState, form: FormData) => Promise<ClientDocumentState>;
  companyId: string;
  documentId?: string;
  defaultValues?: { title: string; bodyHtml: string; fileName?: string | null };
};

export function ClientDocumentForm({ action, companyId, documentId, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="companyId" value={companyId} />
      {documentId && <input type="hidden" name="id" value={documentId} />}

      {state && "error" in state && state.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>
      )}

      <CampoForm label="Título" htmlFor="title" required>
        <Input id="title" name="title" type="text" required defaultValue={defaultValues?.title} placeholder="Ex.: Guia de recolhimento — competência 06/2026" />
      </CampoForm>

      <CampoForm label="Conteúdo" htmlFor="bodyHtml" required helper="Texto que o cliente verá na página de visualização (não vai no corpo do e-mail).">
        <RichTextEditor name="bodyHtml" defaultValue={defaultValues?.bodyHtml} />
      </CampoForm>

      <CampoForm
        label="Anexo (opcional)"
        htmlFor="file"
        helper={defaultValues?.fileName ? `Arquivo atual: ${defaultValues.fileName}. Selecionar um novo substitui o anterior.` : "PDF, JPG, PNG ou WEBP — até 10MB."}
      >
        <input
          id="file"
          name="file"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="text-[12px] text-fg file:mr-3 file:h-9 file:px-3 file:rounded-[10px] file:border file:border-border-strong file:bg-surface-hover file:text-fg file:text-[12px] file:font-medium file:cursor-pointer file:border-solid hover:file:border-brand file:transition-colors"
        />
      </CampoForm>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
