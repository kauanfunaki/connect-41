"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import type { MeetingProvider } from "@/generated/prisma/enums";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";

type UserOption = { id: string; name: string };
type CompanyOption = EmpresaParaEscolher & { name: string };

type MeetingToEdit = {
  id: string;
  provider: MeetingProvider;
  title: string;
  startAtLocal: string; // "YYYY-MM-DDTHH:mm"
  endAtLocal: string;
  companyId: string | null;
  clientName: string | null;
  attendeeIds: string[];
};

type Props = {
  action: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  meeting: MeetingToEdit;
  allUsers: UserOption[];
  companies: CompanyOption[];
  onClose: () => void;
};

const PROVIDER_LABEL: Record<MeetingProvider, string> = { GOOGLE: "Google Meet", MICROSOFT: "Microsoft Teams" };

// Modal de edição — mesmos campos do CreateMeetingDialog, exceto o provedor
// (fixo: trocar de Google pra Teams exigiria criar um evento novo em outro
// lugar, fora do escopo de uma edição). Só quem criou a reunião consegue
// salvar (validado na action, é o token dela que teria permissão de editar o
// evento no provedor).
//
// No `Modal` e com o `FormFooter` (07/10/2026), como a criação.
export function EditMeetingDialog({ action, meeting, allUsers, companies, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onClose();
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state]);

  // Fechar (Esc, clique fora, "X") espera o envio terminar.
  const handleClose = useCallback(() => {
    if (!isPending) onClose();
  }, [isPending, onClose]);

  return (
    <Modal open onClose={handleClose} title="Editar reunião">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="meetingId" value={meeting.id} />

        <CampoForm label="Título" htmlFor="title" required>
          <Input id="title" name="title" required defaultValue={meeting.title} placeholder="Ex: Alinhamento semanal" />
        </CampoForm>

        <div className="grid grid-cols-1 gap-3">
          <CampoForm label="Início" htmlFor="startAt" required>
            <CampoDataHora id="startAt" name="startAt" required defaultValue={meeting.startAtLocal} />
          </CampoForm>
          <CampoForm label="Fim" htmlFor="endAt" required>
            <CampoDataHora id="endAt" name="endAt" required defaultValue={meeting.endAtLocal} />
          </CampoForm>
        </div>

        <CampoForm label="Provedor" htmlFor="provider-readonly" helper="Não é possível trocar o provedor de uma reunião já criada.">
          <Input id="provider-readonly" value={PROVIDER_LABEL[meeting.provider]} disabled readOnly />
        </CampoForm>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CampoForm label="Empresa" htmlFor="companyId">
            <SearchableSelect
              id="companyId"
              name="companyId"
              defaultValue={meeting.companyId ?? ""}
              options={opcoesDeEmpresa(companies)}
              avatar
              lembrarRecentes="empresas"
              vazioLabel="Nenhuma"
              placeholder="Buscar empresa…"
            />
          </CampoForm>
          <CampoForm label="Cliente(s)" htmlFor="clientName" helper="Separe por vírgula, se houver mais de um">
            <Input id="clientName" name="clientName" defaultValue={meeting.clientName ?? ""} placeholder="Ex: Bruno, Maria" />
          </CampoForm>
        </div>

        <AttendeePicker users={allUsers} defaultSelectedIds={meeting.attendeeIds} />

        <FormFooter pending={isPending} submitLabel="Salvar alterações" onCancel={onClose} erro={state?.error} />
      </form>
    </Modal>
  );
}
