"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Video, ExternalLink, Trash2 } from "lucide-react";
import type { MeetingState } from "@/app/(app)/kanban/meetings-actions";
import type { MeetingProvider } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { AttendeePicker } from "@/components/shared/AttendeePicker";

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

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-fg flex items-center gap-1.5">
          <Video size={14} className="text-fg-muted" />
          Reuniões
        </h2>
        {canSchedule && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[12px] font-medium text-brand hover:underline"
          >
            {open ? "Cancelar" : "+ Agendar reunião"}
          </button>
        )}
      </div>

      {open && (
        <form action={formAction} className="mb-4 p-3 bg-surface-hover border border-border rounded-lg space-y-2">
          {!hasAnyProvider ? (
            <p className="text-[12px] text-fg-muted">
              Conecte sua conta Google ou Microsoft em{" "}
              <Link href="/admin/integracoes" className="text-brand hover:underline">Configurações → Integrações</Link>{" "}
              antes de agendar.
            </p>
          ) : (
            <>
              <Input
                name="title"
                required
                placeholder="Título da reunião"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input name="startAt" type="datetime-local" required />
                <Input name="endAt" type="datetime-local" required />
              </div>
              <Select name="provider" required>
                {hasGoogle && <option value="GOOGLE">Google Meet</option>}
                {hasMicrosoft && <option value="MICROSOFT">Microsoft Teams</option>}
              </Select>

              <AttendeePicker users={allUsers} label="Responsáveis pela reunião" />

              <button
                type="submit"
                disabled={isPending}
                className="h-9 px-4 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
              >
                {isPending ? "Agendando…" : "Agendar"}
              </button>
            </>
          )}
          {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
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
                    {new Date(m.startAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <CopyLinkButton url={m.meetingUrl} />
                  <a
                    href={m.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline"
                  >
                    Entrar <ExternalLink size={12} />
                  </a>
                  {canSchedule && (
                    <button
                      type="button"
                      onClick={() => confirm("Remover esta reunião da lista? (não cancela no provedor)") && deleteAction(m.id)}
                      className="text-fg-muted hover:text-danger transition-colors"
                      title="Remover"
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
    </div>
  );
}
