"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { EditMeetingDialog } from "./EditMeetingDialog";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { useConfirm } from "@/components/ui/useConfirm";
import { toSaoPauloDateTimeLocal } from "@/lib/agenda";
import { formatInstantTime } from "@/lib/format";
import { PROVIDER_LABEL, type MeetingActions, type MeetingRow } from "./types";

function formatTime(d: Date): string {
  return formatInstantTime(d, { hour: "2-digit", minute: "2-digit" });
}

type Props = {
  meeting: MeetingRow;
  actions: MeetingActions;
  /**
   * "block" = retângulo posicionado no eixo de horas (visões de dia e semana).
   * "chip" = linha compacta dentro da célula do mês, que não tem eixo de horas.
   */
  variant: "block" | "chip";
  /** Só em "block": posição/altura calculadas pela grade de horas. */
  top?: number;
  height?: number;
};

// Uma reunião renderizada no calendário. O visual muda entre a grade de horas
// e a célula do mês, mas o comportamento (popover com detalhes, entrar, copiar
// link, editar, excluir) é o mesmo — por isso um componente só, em vez de um
// bloco e um chip com popovers duplicados.
export function MeetingItem({ meeting, actions, variant, top = 0, height = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canEdit = meeting.createdByUserId === actions.currentUserId;
  const { dialog: confirmDialog, requestConfirm } = useConfirm();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const start = new Date(meeting.startAt);
  const end = new Date(meeting.endAt);
  const isGoogle = meeting.provider === "GOOGLE";
  const accent = isGoogle ? "var(--c41-brand)" : "#7C5CBF";

  const blockStyle = isGoogle
    ? undefined
    : { background: "rgba(124,92,191,0.16)", borderLeft: "2.5px solid #7C5CBF" };

  const trigger =
    variant === "block" ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={blockStyle}
        className={`w-full h-full rounded-md pl-1.5 pr-1 py-1 text-left overflow-hidden block ${
          isGoogle ? "bg-brand-subtle border-l-[2.5px] border-brand" : ""
        }`}
      >
        <p className="text-[11px] font-medium truncate leading-tight" style={{ color: accent }}>
          {meeting.title}
        </p>
        {height > 30 && (
          <p className="text-[10px] text-fg-muted truncate leading-tight">
            {meeting.company ? meeting.company.name : formatTime(start)}
          </p>
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`${formatTime(start)} · ${meeting.title}`}
        className="w-full flex items-center gap-1 px-1 py-[3px] rounded text-left hover:bg-surface-hover transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
        <span className="text-[10.5px] text-fg-muted tnum flex-shrink-0">{formatTime(start)}</span>
        <span className="text-[10.5px] text-fg truncate min-w-0">{meeting.title}</span>
      </button>
    );

  const positioning =
    variant === "block"
      ? ({ position: "absolute", top, height, left: 2, right: 2 } as const)
      : undefined;

  return (
    // Com o popover (ou o modal de edição) aberto o item sobe acima do marcador
    // de horário atual (z-20) — senão a linha vermelha atravessa por cima das
    // informações da reunião.
    <div ref={rootRef} style={positioning} className={`${variant === "block" ? "" : "relative"} ${open || editing ? "z-30" : "z-10"}`}>
      {trigger}

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 w-64 bg-surface-elevated border border-border-strong rounded-xl shadow-[var(--c41-shadow-lg)] p-3 space-y-2">
          <p className="text-[13px] font-medium text-fg">{meeting.title}</p>
          <p className="text-[12px] text-fg-muted">
            {formatTime(start)}–{formatTime(end)} · {PROVIDER_LABEL[meeting.provider]}
          </p>
          {meeting.company && (
            <p className="text-[12px] text-fg-secondary">
              Empresa:{" "}
              <span className="text-fg">
                {meeting.company.name}
                {meeting.company.externalId && ` · ID ${meeting.company.externalId}`}
              </span>
            </p>
          )}
          {meeting.clientName && (
            <p className="text-[12px] text-fg-secondary">
              Cliente(s): <span className="text-fg">{meeting.clientName}</span>
            </p>
          )}
          {meeting.attendees.length > 0 && (
            <p className="text-[12px] text-fg-secondary">Com {meeting.attendees.map((a) => a.name).join(", ")}</p>
          )}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <a
              href={meeting.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline"
            >
              Entrar <ExternalLink size={12} />
            </a>
            <CopyLinkButton url={meeting.meetingUrl} />
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 text-[12px] text-fg-secondary hover:text-fg transition-colors"
              >
                <Pencil size={11} /> Editar
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                requestConfirm(
                  { title: "Excluir esta reunião?", destructive: true, confirmLabel: "Excluir" },
                  () => actions.deleteAction(meeting.id)
                )
              }
              className="text-[12px] text-danger hover:underline ml-auto"
            >
              Excluir
            </button>
          </div>
        </div>
      )}
      {confirmDialog}

      {editing && (
        <EditMeetingDialog
          action={actions.editAction}
          meeting={{
            id: meeting.id,
            provider: meeting.provider,
            title: meeting.title,
            startAtLocal: toSaoPauloDateTimeLocal(start),
            endAtLocal: toSaoPauloDateTimeLocal(end),
            companyId: meeting.company?.id ?? null,
            clientName: meeting.clientName,
            attendeeIds: meeting.attendees.map((a) => a.id),
          }}
          allUsers={actions.allUsers}
          companies={actions.companies}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
