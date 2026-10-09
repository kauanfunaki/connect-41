"use client";

import { useActionState, useState } from "react";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import type { ClientDocumentState } from "@/app/(app)/solicitacoes/envios/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { CampoGuardarNosArquivos } from "@/components/arquivos/CampoGuardarNosArquivos";

type Props = {
  action: (prev: ClientDocumentState, form: FormData) => Promise<ClientDocumentState>;
  /** A empresa do envio, quando já está decidida (edição, ou novo envio sem a escolha). */
  companyId?: string;
  /**
   * As empresas para escolher, no novo envio da aba "Envios" (08/10/2026): o
   * envio deixou a ficha da empresa, então a empresa virou campo. Com
   * `companyId`, ela chega escolhida (o `?empresa=` da ficha).
   */
  empresas?: Opcao[];
  documentId?: string;
  cancelHref: string;
  defaultValues?: { title: string; bodyHtml: string; fileName?: string | null; requiresSignature?: boolean };
};

export function ClientDocumentForm({ action, companyId, empresas, documentId, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  // A empresa do envio, para o "Guardar também em Arquivos" buscar as pastas dela.
  const [empresaId, setEmpresaId] = useState<string | null>(companyId ?? null);

  return (
    <form action={formAction} className="space-y-5">
      {!empresas && companyId && <input type="hidden" name="companyId" value={companyId} />}
      {documentId && <input type="hidden" name="id" value={documentId} />}

      {state && "error" in state && state.error && (
        <Aviso>{state.error}</Aviso>
      )}

      {empresas && (
        <CampoForm label="Empresa" htmlFor="companyId" required helper="O documento aparece no portal das pessoas do cliente desta empresa, depois de publicado.">
          <SearchableSelect
            id="companyId"
            name="companyId"
            options={empresas}
            defaultValue={companyId}
            avatar
            lembrarRecentes="empresas"
            placeholder="Buscar empresa…"
            onChange={(v) => setEmpresaId(v || null)}
          />
        </CampoForm>
      )}

      <CampoForm label="Título" htmlFor="title" required>
        <Input id="title" name="title" type="text" required defaultValue={defaultValues?.title} placeholder="Ex.: Guia de recolhimento — competência 06/2026" />
      </CampoForm>

      <CampoForm label="Conteúdo" htmlFor="bodyHtml" required helper="O texto que o cliente lê no portal e na página do link por e-mail (não vai no corpo do e-mail).">
        <RichTextEditor name="bodyHtml" defaultValue={defaultValues?.bodyHtml} />
      </CampoForm>

      {/* 10 MB, o teto que o servidor aplica (`saveClientDocumentFile`): a tela
          dizia 20 e deixava passar um arquivo que a gravação recusava. */}
      <CampoForm
        label="Anexo (opcional)"
        htmlFor="file"
        helper={defaultValues?.fileName ? `Arquivo atual: ${defaultValues.fileName}. Selecionar um novo substitui o anterior.` : "PDF, JPG, PNG ou WEBP — até 10 MB."}
      >
        <FileDropzoneField id="file" name="file" accept=".jpg,.jpeg,.png,.webp,.pdf" maxSizeMb={10} />
      </CampoForm>
      <CampoGuardarNosArquivos companyId={empresaId} id="envio-guardar-em-pasta" />

      <div className="border-t border-border pt-4">
        <Checkbox
          name="requiresSignature"
          value="true"
          defaultChecked={defaultValues?.requiresSignature ?? false}
          label="Pedir o aceite eletrônico do cliente (nome, data/hora e IP, no portal ou na página do link por e-mail)."
        />
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
