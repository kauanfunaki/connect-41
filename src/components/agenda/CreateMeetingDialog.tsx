"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { MeetingState } from "@/app/(app)/agenda/actions";

type UserOption = { id: string; name: string };

type Props = {
  action: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  initialStart: string; // "YYYY-MM-DDTHH:mm"
  initialEnd: string;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: UserOption[];
  onClose: () => void;
};

// Modal de criação — mesmos campos do form dentro do item de Kanban
// (MeetingsSection), mas sem vínculo com pipelineItemId: reunião é criada
// direto pela Agenda. Componente remonta a cada abertura (o pai só o
// renderiza quando open=true), então defaultValue reflete sempre o slot
// clicado mais recente sem precisar de estado controlado.
export function CreateMeetingDialog({ action, initialStart, initialEnd, hasGoogle, hasMicrosoft, allUsers, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const hasAnyProvider = hasGoogle || hasMicrosoft;
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
        aria-labelledby="create-meeting-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-[var(--c41-shadow-lg)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="create-meeting-title" className="text-[length:var(--fs-section)] font-semibold text-fg">
            Nova reunião
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

        {!hasAnyProvider ? (
          <p className="text-[length:var(--fs-body)] text-fg-muted">
            Conecte sua conta Google ou Microsoft em{" "}
            <Link href="/admin/integracoes" className="text-brand hover:underline">Configurações → Integrações</Link>{" "}
            antes de agendar.
          </p>
        ) : (
          <form action={formAction} className="space-y-3">
            <CampoForm label="Título" htmlFor="title" required>
              <Input id="title" name="title" required placeholder="Ex: Alinhamento semanal" />
            </CampoForm>

            <div className="grid grid-cols-2 gap-3">
              <CampoForm label="Início" htmlFor="startAt" required>
                <Input id="startAt" name="startAt" type="datetime-local" required defaultValue={initialStart} />
              </CampoForm>
              <CampoForm label="Fim" htmlFor="endAt" required>
                <Input id="endAt" name="endAt" type="datetime-local" required defaultValue={initialEnd} />
              </CampoForm>
            </div>

            <CampoForm label="Provedor" htmlFor="provider" required>
              <Select id="provider" name="provider" required>
                {hasGoogle && <option value="GOOGLE">Google Meet</option>}
                {hasMicrosoft && <option value="MICROSOFT">Microsoft Teams</option>}
              </Select>
            </CampoForm>

            {allUsers.length > 0 && (
              <div>
                <p className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">Responsáveis</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-h-28 overflow-y-auto">
                  {allUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-secondary">
                      <Checkbox name="attendeeIds" value={u.id} />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

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
                {isPending ? "Agendando…" : "Agendar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
