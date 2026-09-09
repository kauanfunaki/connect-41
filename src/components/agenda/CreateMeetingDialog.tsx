"use client";

import { useActionState, useCallback, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/useDialog";
import Link from "next/link";
import { X } from "lucide-react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

type UserOption = { id: string; name: string };
type CompanyOption = { id: string; name: string };

type Props = {
  action: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  initialStart: string; // "YYYY-MM-DDTHH:mm"
  initialEnd: string;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: UserOption[];
  companies: CompanyOption[];
  onClose: () => void;
};

// Modal de criação — mesmos campos do form dentro do item de Kanban
// (MeetingsSection), mas sem vínculo com pipelineItemId: reunião é criada
// direto pela Agenda. Componente remonta a cada abertura (o pai só o
// renderiza quando open=true), então defaultValue reflete sempre o slot
// clicado mais recente sem precisar de estado controlado.
export function CreateMeetingDialog({ action, initialStart, initialEnd, hasGoogle, hasMicrosoft, allUsers, companies, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const hasAnyProvider = hasGoogle || hasMicrosoft;
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onClose();
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state]);

  const titleId = useId();
  const handleClose = useCallback(() => {
    if (!isPending) onClose();
  }, [isPending, onClose]);
  const panelRef = useDialog(true, handleClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-[var(--c41-shadow-lg)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-[length:var(--fs-section)] font-semibold text-fg">
            Nova reunião
          </h2>
          <Button
            variant="linkMuted"
            className="disabled:opacity-60"
            onClick={onClose}
            disabled={isPending}
            aria-label="Fechar"
          >
            <X size={16} />
          </Button>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CampoForm label="Empresa" htmlFor="companyId">
                <SearchableSelect
                  id="companyId"
                  name="companyId"
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  vazioLabel="Nenhuma"
                  placeholder="Buscar empresa…"
                />
              </CampoForm>
              <CampoForm label="Cliente(s)" htmlFor="clientName" helper="Separe por vírgula, se houver mais de um">
                <Input id="clientName" name="clientName" placeholder="Ex: Bruno, Maria" />
              </CampoForm>
            </div>

            <AttendeePicker users={allUsers} />

            {state?.error && <p className="text-[length:var(--fs-helper)] text-danger">{state.error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                variant="primary" className="font-medium disabled:opacity-60"
              >
                {isPending ? "Agendando…" : "Agendar"}
             </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
