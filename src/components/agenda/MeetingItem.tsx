"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Calendar, ExternalLink, Pencil, Trash2, Users, Video } from "lucide-react";
import { EditMeetingDialog } from "./EditMeetingDialog";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { initialsFromName } from "@/components/shared/AvatarImage";
import { useConfirm } from "@/components/ui/useConfirm";
import { toSaoPauloDateTimeLocal } from "@/lib/agenda";
import { formatInstantDate, formatInstantTime } from "@/lib/format";
import { PROVIDER_LABEL, type MeetingActions, type MeetingRow } from "./types";
import { Button } from "@/components/ui/Button";

function formatTime(d: Date): string {
  return formatInstantTime(d, { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(d: Date): string {
  return formatInstantDate(d, { weekday: "short", day: "2-digit", month: "short" });
}

type Props = {
  meeting: MeetingRow;
  actions: MeetingActions;
  /**
   * "block" = retângulo posicionado no eixo de horas (visões de dia e semana).
   * "chip" = linha compacta dentro da célula do mês, que não tem eixo de horas.
   */
  variant: "block" | "chip";
  /**
   * Só em "block": posição/altura na grade de horas, já como valor CSS
   * (percentual). A grade divide a altura disponível entre as horas em vez de
   * fixar pixels por linha, então a posição precisa ser relativa.
   */
  top?: string;
  height?: string;
  /**
   * Só em "block": reunião curta demais pra caber duas linhas de texto.
   * Vem da duração em minutos, não da altura renderizada — a altura em pixels
   * agora depende do tamanho da janela, mas "meia hora é apertado" não.
   */
  compact?: boolean;
};

// Uma reunião renderizada no calendário. O visual muda entre a grade de horas
// e a célula do mês, mas o comportamento (popover com detalhes, entrar, copiar
// link, editar, excluir) é o mesmo — por isso um componente só, em vez de um
// bloco e um chip com popovers duplicados.
export function MeetingItem({ meeting, actions, variant, top, height, compact = false }: Props) {
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
  // A cor é a do provedor. O Teams usa o azul de informação (padrão aceito
  // pelo Kauan na página de decisões, 08/10/2026): era o roxo do DP (#7C5CBF,
  // o `--c41-sector-dprh`), e numa agenda em que o prazo vem na cor do setor a
  // reunião do Teams lia como prazo do DP. Pelo token, o escuro vem junto — o
  // título no fundo do bloco foi de 2,9:1 para 4,9:1 lá (e de 4,1 para 4,5:1
  // no claro).
  const accent = isGoogle ? "var(--c41-brand)" : "var(--c41-info)";
  const fundo = isGoogle ? "var(--c41-brand-subtle)" : "var(--c41-info-bg)";

  const trigger =
    variant === "block" ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`w-full h-full rounded-md pl-1.5 pr-1 py-1 text-left overflow-hidden block border-l-[2.5px] ${
          isGoogle ? "bg-brand-subtle border-brand" : "bg-info-bg border-info"
        }`}
      >
        <p className="text-fs-1 font-medium truncate leading-tight" style={{ color: accent }}>
          {meeting.title}
        </p>
        {!compact && (
          <p className="text-micro text-fg-muted truncate leading-tight">
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
        title={`${formatTime(start)} · ${meeting.title}`} aria-label={`${formatTime(start)} · ${meeting.title}`}
        className="w-full flex items-center gap-1 px-1 py-[3px] rounded text-left hover:bg-surface-hover transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
        <span className="text-micro text-fg-muted tnum flex-shrink-0">{formatTime(start)}</span>
        <span className="text-micro text-fg truncate min-w-0">{meeting.title}</span>
      </button>
    );

  const positioning =
    variant === "block"
      ? ({ position: "absolute", top, height, minHeight: 16, left: 2, right: 2 } as const)
      : undefined;

  return (
    // Com o popover (ou o modal de edição) aberto o item sobe acima do marcador
    // de horário atual (z-20) — senão a linha vermelha atravessa por cima das
    // informações da reunião.
    <div ref={rootRef} style={positioning} className={`${variant === "block" ? "" : "relative"} ${open || editing ? "z-30" : "z-10"}`}>
      {trigger}

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1.5 w-80 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] overflow-hidden">
          <div className="h-1" style={{ background: accent }} />

          <div className="p-3.5 space-y-3">
            <div>
              <p className="text-fs-4 font-semibold text-fg leading-snug">{meeting.title}</p>
              <span
                className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded text-micro font-medium"
                style={{ color: accent, background: fundo }}
              >
                {PROVIDER_LABEL[meeting.provider]}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-fs-2 text-fg-secondary">
                <Calendar size={13} className="text-fg-muted flex-shrink-0" />
                <span className="capitalize">{formatDayLabel(start)}</span>
                <span className="text-fg-muted">·</span>
                <span className="tnum">{formatTime(start)}–{formatTime(end)}</span>
              </div>

              {meeting.company && (
                <div className="flex items-start gap-2 text-fs-2 text-fg-secondary">
                  <Building2 size={13} className="text-fg-muted flex-shrink-0 mt-0.5" />
                  <span>
                    <span className="text-fg font-medium">{meeting.company.name}</span>
                    {meeting.company.externalId && <span className="text-fg-muted"> · ID {meeting.company.externalId}</span>}
                  </span>
                </div>
              )}

              {meeting.clientName && (
                <div className="flex items-start gap-2 text-fs-2 text-fg-secondary">
                  <Users size={13} className="text-fg-muted flex-shrink-0 mt-0.5" />
                  <span className="text-fg">{meeting.clientName}</span>
                </div>
              )}

              {meeting.attendees.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5 flex-shrink-0">
                    {meeting.attendees.slice(0, 4).map((a) => (
                      <span
                        key={a.id}
                        title={a.name}
                        className="w-5 h-5 rounded-full bg-brand-subtle text-brand border border-surface-elevated flex items-center justify-center text-micro font-semibold"
                      >
                        {initialsFromName(a.name)}
                      </span>
                    ))}
                  </div>
                  <p className="text-micro text-fg-muted truncate">
                    {meeting.attendees.map((a) => a.name).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* flex-wrap, não uma linha só: com Entrar + Copiar link + Editar +
              Excluir os rótulos passam da largura do popover e o último ficava
              cortado (só a lixeira e o "E" de Excluir apareciam). */}
          <div className="flex flex-wrap items-center gap-1 px-2.5 py-2 border-t border-border bg-surface-hover/40">
            {/* Eram três textos com fundo no hover ao lado de um Excluir com
                borda (30/09): as quatro ações agora são botões xs com borda. A
                cor do provedor fica no ícone do Entrar. */}
            <Button href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="xs">
              <Video size={11} style={{ color: accent }} /> Entrar <ExternalLink size={10} />
            </Button>
            <CopyLinkButton url={meeting.meetingUrl} variant="botao" />
            {canEdit && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
              >
                <Pencil size={11} /> Editar
              </Button>
            )}
            <Button
              variant="danger"
              size="xs"
              onClick={() =>
                requestConfirm(
                  { title: "Excluir esta reunião?", destructive: true, confirmLabel: "Excluir" },
                  () => actions.deleteAction(meeting.id)
                )
              }
            >
              <Trash2 size={11} /> Excluir
            </Button>
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
