"use client";

import { useActionState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import type { MeetingProvider } from "@/generated/prisma/enums";

type UserOption = { id: string; name: string };
type CompanyOption = { id: string; name: string };

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
export function EditMeetingDialog({ action, meeting, allUsers, companies, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onClose();
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-meeting-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-[var(--c41-shadow-lg)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="edit-meeting-title" className="text-[length:var(--fs-section)] font-semibold text-fg">
            Editar reunião
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-fg-muted hover:text-fg transition-colors disabled:opacity-60"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="meetingId" value={meeting.id} />

          <CampoForm label="Título" htmlFor="title" required>
            <Input id="title" name="title" required defaultValue={meeting.title} placeholder="Ex: Alinhamento semanal" />
          </CampoForm>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoForm label="Início" htmlFor="startAt" required>
              <Input id="startAt" name="startAt" type="datetime-local" required defaultValue={meeting.startAtLocal} />
            </CampoForm>
            <CampoForm label="Fim" htmlFor="endAt" required>
              <Input id="endAt" name="endAt" type="datetime-local" required defaultValue={meeting.endAtLocal} />
            </CampoForm>
          </div>

          <CampoForm label="Provedor" htmlFor="provider-readonly" helper="Não é possível trocar o provedor de uma reunião já criada.">
            <Input id="provider-readonly" value={PROVIDER_LABEL[meeting.provider]} disabled readOnly />
          </CampoForm>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoForm label="Empresa" htmlFor="companyId">
              <Select id="companyId" name="companyId" defaultValue={meeting.companyId ?? ""}>
                <option value="">Nenhuma</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Cliente(s)" htmlFor="clientName" helper="Separe por vírgula, se houver mais de um">
              <Input id="clientName" name="clientName" defaultValue={meeting.clientName ?? ""} placeholder="Ex: Bruno, Maria" />
            </CampoForm>
          </div>

          <AttendeePicker users={allUsers} defaultSelectedIds={meeting.attendeeIds} />

          {state?.error && <p className="text-[length:var(--fs-helper)] text-danger">{state.error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
