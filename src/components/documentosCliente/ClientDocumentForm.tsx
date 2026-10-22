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
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { CampoHora } from "@/components/ui/CampoHora";
import { EmailChipsInput } from "@/components/documentosCliente/EmailChipsInput";
import { OPCOES_DO_LEMBRETE } from "@/lib/envios/lembrete";

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
  defaultValues?: {
    title: string;
    bodyHtml: string;
    fileName?: string | null;
    requiresSignature?: boolean;
    /** O lembrete de não lido escolhido (22/10/2026). */
    reminderDays?: number | null;
    /** O agendamento gravado: data/hora de Brasília e os e-mails (22/10/2026). */
    agendamento?: { data: string; hora: string; emails: string[] } | null;
  };
};

export function ClientDocumentForm({ action, companyId, empresas, documentId, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  // A empresa do envio, para o "Guardar também em Arquivos" buscar as pastas dela.
  const [empresaId, setEmpresaId] = useState<string | null>(companyId ?? null);
  const agendamento = defaultValues?.agendamento ?? null;
  const [agendar, setAgendar] = useState(!!agendamento);

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

      {/* Quando enviar (22/10/2026): o lembrete de não lido e o envio agendado. */}
      <div className="border-t border-border pt-4 space-y-4">
        <CampoForm
          label="Lembrete de não lido"
          htmlFor="reminderDays"
          helper="Se ninguém do cliente abrir o documento no prazo, sai um lembrete (e-mail a quem recebeu e aviso no portal). Um só por envio."
        >
          <Select id="reminderDays" name="reminderDays" defaultValue={defaultValues?.reminderDays ? String(defaultValues.reminderDays) : ""}>
            {OPCOES_DO_LEMBRETE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </CampoForm>

        <Checkbox
          name="agendar"
          checked={agendar}
          onChange={(e) => setAgendar(e.target.checked)}
          label="Agendar o envio: publicar e mandar por e-mail sozinho, na data e hora escolhidas (horário de Brasília)."
        />
        {agendar && (
          <div className="space-y-4 pl-6">
            <div className="flex flex-wrap gap-4">
              <CampoForm label="Data" htmlFor="agendarData" required>
                <CampoData id="agendarData" name="agendarData" defaultValue={agendamento?.data} required />
              </CampoForm>
              <CampoForm label="Hora" htmlFor="agendarHora" helper="Sem hora, 08:00.">
                <CampoHora id="agendarHora" name="agendarHora" defaultValue={agendamento?.hora} />
              </CampoForm>
            </div>
            <Checkbox
              name="agendarEmailEmpresa"
              defaultChecked={!agendamento}
              label="Mandar também ao e-mail cadastrado da empresa (se houver)."
            />
            <CampoForm label="E-mails avulsos" htmlFor="agendarEmails" helper="Até a hora marcada o cliente não vê nada — nem no portal, nem por e-mail.">
              <EmailChipsInput id="agendarEmails" name="agendarEmails" defaultEmails={agendamento?.emails} />
            </CampoForm>
          </div>
        )}
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
