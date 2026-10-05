"use client";

import { useActionState, useId, useState } from "react";
import { Video, ExternalLink, Plus, Trash2, X } from "lucide-react";
import type { MeetingState } from "@/app/(app)/kanban/meetings-actions";
import type { MeetingProvider } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import { formatInstantDateTime } from "@/lib/format";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type MeetingRow = {
  id: string;
  provider: MeetingProvider;
  title: string;
  meetingUrl: string;
  startAt: string;
  endAt: string;
  attendees: { id: string; name: string }[];
};

type SectorUser = { id: string; name: string };

type Props = {
  meetings: MeetingRow[];
  canSchedule: boolean;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: SectorUser[];
  scheduleAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  deleteAction: (meetingId: string) => Promise<void>;
};

const PROVIDER_LABEL: Record<MeetingProvider, string> = { GOOGLE: "Google Meet", MICROSOFT: "MS Teams" };

export function MeetingsSection({ meetings, canSchedule, hasGoogle, hasMicrosoft, allUsers, scheduleAction, deleteAction }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(scheduleAction, null);
  const hasAnyProvider = hasGoogle || hasMicrosoft;
  const uid = useId();
  const { dialog, requestConfirm } = useConfirm();

  return (
    <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg flex items-center gap-1.5">
          <Video size={14} className="text-fg-muted" />
          Reuniões
        </h2>
        {canSchedule && (
          // Eram links azuis (30/09): "Agendar" e "Cancelar" são ações.
          <Button variant="secondary" size="xs" type="button" onClick={() => setOpen((o) => !o)}>
            {open ? (
              <>
                <X size={11} /> Cancelar
              </>
            ) : (
              <>
                <Plus size={11} /> Agendar reunião
              </>
            )}
          </Button>
        )}
      </div>

      {open && (
        // Campos com rótulo (30/09): início e fim eram dois campos de data e
        // hora lado a lado sem dizer qual era qual.
        <form action={formAction} className="mb-4 p-4 bg-surface-hover border border-border rounded-lg space-y-3">
          {!hasAnyProvider ? (
            // Revisão de 05/10: botão não é link — o destino era texto azul no meio da frase.
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <p className="text-[12px] text-fg-muted">Conecte sua conta Google ou Microsoft antes de agendar.</p>
              <Button href="/admin/integracoes" variant="secondary" size="xs">
                Abrir Integrações
              </Button>
            </div>
          ) : (
            <>
              <CampoForm label="Título" htmlFor={`${uid}-reuniao-titulo`} required>
                <Input
                  id={`${uid}-reuniao-titulo`}
                  name="title"
                  required
                  placeholder="Título da reunião"
                />
              </CampoForm>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CampoForm label="Início" htmlFor={`${uid}-reuniao-inicio`} required>
                  <CampoDataHora id={`${uid}-reuniao-inicio`} name="startAt" required />
                </CampoForm>
                <CampoForm label="Fim" htmlFor={`${uid}-reuniao-fim`} required>
                  <CampoDataHora id={`${uid}-reuniao-fim`} name="endAt" required />
                </CampoForm>
                <CampoForm label="Plataforma" htmlFor={`${uid}-reuniao-plataforma`} required>
                  <Select id={`${uid}-reuniao-plataforma`} name="provider" required>
                    {hasGoogle && <option value="GOOGLE">Google Meet</option>}
                    {hasMicrosoft && <option value="MICROSOFT">Microsoft Teams</option>}
                  </Select>
                </CampoForm>
              </div>

              <AttendeePicker users={allUsers} label="Responsáveis pela reunião" />

              <Button
                variant="primary"
                type="submit"
                disabled={isPending}
              >
                {isPending ? "Agendando…" : "Agendar"}
              </Button>
            </>
          )}
          {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhuma reunião agendada.</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="px-3 py-2 rounded-lg bg-surface-hover border border-border">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-fg font-medium truncate">{m.title}</p>
                  <p className="text-[11px] text-fg-muted">
                    {PROVIDER_LABEL[m.provider]} ·{" "}
                    {formatInstantDateTime(new Date(m.startAt), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <CopyLinkButton url={m.meetingUrl} variant="botao" />
                  {/* Entrar é a ação da linha: botão, e não link azul (30/09). */}
                  <Button href={m.meetingUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="xs">
                    Entrar <ExternalLink size={11} />
                  </Button>
                  {canSchedule && (
                    <button
                      type="button"
                      onClick={() =>
                        requestConfirm(
                          { title: "Remover esta reunião da lista?", description: "Não cancela no provedor.", destructive: true, confirmLabel: "Remover" },
                          () => deleteAction(m.id)
                        )
                      }
                      className="text-fg-muted hover:text-danger transition-colors"
                      title="Remover" aria-label="Remover"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {m.attendees.length > 0 && (
                <p className="text-[11px] text-fg-muted mt-1.5">
                  Responsáveis: {m.attendees.map((a) => a.name).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
