"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Circle, Eye, Flag, Play, Square, Tag as TagIcon, Timer, Users, Calendar, Repeat } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { TagToggleList } from "@/components/kanban/TagToggleList";
import { AssigneeToggleList } from "@/components/kanban/AssigneeToggleList";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type StageOption = { id: string; name: string };
type TagOption = { id: string; name: string; color: string };
type UserOption = { id: string; name: string };

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};
const FREQUENCY_LABEL: Record<string, string> = { DAILY: "Diária", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal" };

function formatDateBR(value: string): string {
  // eslint-disable-next-line no-restricted-syntax
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-2 w-40 flex-shrink-0 text-[13px] text-fg-muted">
        {icon}
        {label}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

type Props = {
  canAct: boolean;
  itemId: string;
  stages: StageOption[];
  currentStageId: string;
  moveAction: (itemId: string, newStageId: string) => Promise<void>;

  dueDate: string | null;
  startDate: string | null;
  recurring: boolean;
  recurrenceFrequency: string | null;
  priority: number;
  datesAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;

  estimateMinutes: number | null;
  estimateAction: (minutes: string) => Promise<void>;

  activeTimer: { userId: string; userName: string; startedAt: string } | null;
  currentUserId: string | null;
  startTimerAction: () => Promise<void>;
  stopTimerAction: () => Promise<void>;

  allTags: TagOption[];
  selectedTagIds: string[];
  tagToggleAction: (tagId: string, marcado: boolean) => Promise<void>;

  allUsers: UserOption[];
  selectedUserIds: string[];
  assigneeToggleAction: (userId: string, marcado: boolean) => Promise<void>;

  selectedWatcherIds: string[];
  watcherToggleAction: (userId: string, marcado: boolean) => Promise<void>;
};

export function TaskFieldsPanel({
  canAct, itemId, stages, currentStageId, moveAction,
  dueDate, startDate, recurring, recurrenceFrequency, priority, datesAction,
  estimateMinutes, estimateAction,
  activeTimer, currentUserId, startTimerAction, stopTimerAction,
  allTags, selectedTagIds, tagToggleAction,
  allUsers, selectedUserIds, assigneeToggleAction,
  selectedWatcherIds, watcherToggleAction,
}: Props) {
  const [collapseEmpty, setCollapseEmpty] = useState(false);
  const [, startTransition] = useTransition();

  const currentStageName = stages.find((s) => s.id === currentStageId)?.name ?? "—";
  const selectedUsers = allUsers.filter((u) => selectedUserIds.includes(u.id));
  const selectedWatchers = allUsers.filter((u) => selectedWatcherIds.includes(u.id));
  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));

  const hasResponsaveis = selectedUsers.length > 0;
  const hasParticipantes = selectedWatchers.length > 0;
  const hasDatas = !!dueDate || !!startDate;
  const hasEstimativa = estimateMinutes != null;
  const hasEtiquetas = selectedTags.length > 0;

  return (
    <div className="border-b border-border pb-3 mb-4">
      {/* Status */}
      <FieldRow icon={<Circle size={14} />} label="Status">
        {canAct ? (
          <Dropdown
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-danger/15 text-danger text-[12px] font-semibold"
              >
                {currentStageName.toUpperCase()} <ChevronDown size={12} />
              </button>
            )}
          >
            {stages.map((s) => (
              <DropdownItem key={s.id} onClick={() => startTransition(() => moveAction(itemId, s.id))}>
                <span className="flex items-center justify-between gap-2">
                  {s.name}
                  {currentStageId === s.id && <Check size={14} className="text-brand flex-shrink-0" />}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
        ) : (
          <span className="text-[13px] text-fg">{currentStageName}</span>
        )}
      </FieldRow>

      {/* Responsáveis */}
      {(!collapseEmpty || hasResponsaveis) && (
        <FieldRow icon={<Users size={14} />} label="Responsáveis">
          {canAct ? (
            <Dropdown
              width={260}
              trigger={({ open, toggle }) => (
                <button type="button" onClick={toggle} aria-expanded={open} className="text-[13px] text-fg hover:text-brand transition-colors">
                  {hasResponsaveis ? selectedUsers.map((u) => u.name).join(", ") : <span className="text-fg-muted">Vazio</span>}
                </button>
              )}
            >
              <AssigneeToggleList allUsers={allUsers} selectedIds={selectedUserIds} toggleAction={assigneeToggleAction} />
            </Dropdown>
          ) : (
            <span className="text-[13px] text-fg">{hasResponsaveis ? selectedUsers.map((u) => u.name).join(", ") : "—"}</span>
          )}
        </FieldRow>
      )}

      {/* Participantes (observadores) */}
      {(!collapseEmpty || hasParticipantes) && (
        <FieldRow icon={<Eye size={14} />} label="Participantes">
          {canAct ? (
            <Dropdown
              width={260}
              trigger={({ open, toggle }) => (
                <button type="button" onClick={toggle} aria-expanded={open} className="text-[13px] text-fg hover:text-brand transition-colors">
                  {hasParticipantes ? selectedWatchers.map((u) => u.name).join(", ") : <span className="text-fg-muted">Vazio</span>}
                </button>
              )}
            >
              <AssigneeToggleList allUsers={allUsers} selectedIds={selectedWatcherIds} toggleAction={watcherToggleAction} />
            </Dropdown>
          ) : (
            <span className="text-[13px] text-fg">{hasParticipantes ? selectedWatchers.map((u) => u.name).join(", ") : "—"}</span>
          )}
        </FieldRow>
      )}

      {/* Datas */}
      {(!collapseEmpty || hasDatas) && (
        <FieldRow icon={<Calendar size={14} />} label="Datas">
          {canAct ? (
            <DatesPopover
              dueDate={dueDate}
              startDate={startDate}
              priority={priority}
              recurring={recurring}
              recurrenceFrequency={recurrenceFrequency}
              datesAction={datesAction}
            />
          ) : (
            <span className="text-[13px] text-fg flex items-center gap-1.5">
              {startDate ? formatDateBR(startDate.slice(0, 10)) : "—"} → {dueDate ? formatDateBR(dueDate.slice(0, 10)) : "—"}
              {recurring && <Repeat size={12} className="text-fg-muted" />}
            </span>
          )}
        </FieldRow>
      )}

      {/* Prioridade */}
      <FieldRow icon={<Flag size={14} />} label="Prioridade">
        {canAct ? (
          <PriorityPopover priority={priority} dueDate={dueDate} startDate={startDate} recurring={recurring} recurrenceFrequency={recurrenceFrequency} datesAction={datesAction} />
        ) : (
          <span className="text-[13px] text-fg flex items-center gap-1.5">
            <Flag size={12} style={{ color: PRIORITY_COLOR[priority] }} /> {PRIORITY_LABEL[priority]}
          </span>
        )}
      </FieldRow>

      {/* Estimativa de tempo */}
      {(!collapseEmpty || hasEstimativa) && (
        <FieldRow icon={<Timer size={14} />} label="Estimativa de tempo">
          <EstimatePopover canAct={canAct} estimateMinutes={estimateMinutes} estimateAction={estimateAction} />
        </FieldRow>
      )}

      {/* Rastrear tempo */}
      <FieldRow icon={<Play size={14} />} label="Rastrear tempo">
        {activeTimer ? (
          activeTimer.userId === currentUserId ? (
            <button
              type="button"
              onClick={() => startTransition(() => stopTimerAction())}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-danger/15 text-danger text-[12px] font-medium hover:bg-danger/25 transition-colors"
            >
              <Square size={11} /> Parar
            </button>
          ) : (
            <span className="text-[12px] text-fg-muted">{activeTimer.userName} está rastreando…</span>
          )
        ) : canAct ? (
          <button
            type="button"
            onClick={() => startTransition(() => startTimerAction())}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
          >
            <Play size={11} /> Start
          </button>
        ) : (
          <span className="text-[13px] text-fg-muted">—</span>
        )}
      </FieldRow>

      {/* Etiquetas */}
      {(!collapseEmpty || hasEtiquetas) && (
        <FieldRow icon={<TagIcon size={14} />} label="Etiquetas">
          {canAct ? (
            <Dropdown
              width={260}
              trigger={({ open, toggle }) => (
                <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 flex-wrap">
                  {hasEtiquetas ? (
                    selectedTags.map((t) => (
                      <span key={t.id} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: `${t.color}1A`, color: t.color }}>
                        {t.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-fg-muted">Vazio</span>
                  )}
                </button>
              )}
            >
              <TagToggleList allTags={allTags} selectedIds={selectedTagIds} toggleAction={tagToggleAction} />
            </Dropdown>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              {selectedTags.map((t) => (
                <span key={t.id} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: `${t.color}1A`, color: t.color }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </FieldRow>
      )}

      <button
        type="button"
        onClick={() => setCollapseEmpty((v) => !v)}
        className="text-[11px] text-fg-muted hover:text-fg transition-colors mt-1"
      >
        {collapseEmpty ? "Mostrar todos os campos" : "Recolher campos vazios"}
      </button>
    </div>
  );
}

function DatesPopover({
  dueDate, startDate, priority, recurring, recurrenceFrequency, datesAction,
}: {
  dueDate: string | null; startDate: string | null; priority: number; recurring: boolean; recurrenceFrequency: string | null;
  datesAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
}) {
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState(startDate ? startDate.slice(0, 10) : "");
  const [end, setEnd] = useState(dueDate ? dueDate.slice(0, 10) : "");
  const [isRecurring, setIsRecurring] = useState(recurring);
  const [frequency, setFrequency] = useState(recurrenceFrequency ?? "MONTHLY");

  function save(overrides: Partial<{ start: string; end: string; recurring: boolean; frequency: string }> = {}) {
    const s = overrides.start ?? start;
    const e = overrides.end ?? end;
    const r = overrides.recurring ?? isRecurring;
    const f = overrides.frequency ?? frequency;
    const form = new FormData();
    form.set("startDate", s);
    form.set("dueDate", e);
    form.set("priority", String(priority));
    form.set("recurring", r ? "true" : "false");
    if (r) form.set("recurrenceFrequency", f);
    startTransition(() => { datesAction(null, form); });
  }

  return (
    <Dropdown
      width={240}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} disabled={isPending} className="text-[13px] text-fg hover:text-brand transition-colors flex items-center gap-1.5">
          {start ? formatDateBR(start) : "Início"} → {end ? formatDateBR(end) : "Fim"}
          {recurring && <Repeat size={12} className="text-fg-muted" />}
        </button>
      )}
    >
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-fg-muted">Início</label>
        <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); save({ start: e.target.value }); }} />
        <label className="block text-[11px] font-medium text-fg-muted">Fim</label>
        <Input type="date" value={end} onChange={(e) => { setEnd(e.target.value); save({ end: e.target.value }); }} />
        <Checkbox
          label="Recorrente"
          checked={isRecurring}
          onChange={(e) => { const checked = e.target.checked; setIsRecurring(checked); save({ recurring: checked }); }}
        />
        {isRecurring && (
          <Select value={frequency} onChange={(e) => { setFrequency(e.target.value); save({ frequency: e.target.value }); }}>
            {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        )}
      </div>
    </Dropdown>
  );
}

function PriorityPopover({
  priority, dueDate, startDate, recurring, recurrenceFrequency, datesAction,
}: {
  priority: number; dueDate: string | null; startDate: string | null; recurring: boolean; recurrenceFrequency: string | null;
  datesAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
}) {
  const [, startTransition] = useTransition();
  const [current, setCurrent] = useState(priority);

  function select(next: number) {
    setCurrent(next);
    const form = new FormData();
    form.set("startDate", startDate ? startDate.slice(0, 10) : "");
    form.set("dueDate", dueDate ? dueDate.slice(0, 10) : "");
    form.set("priority", String(next));
    form.set("recurring", recurring ? "true" : "false");
    if (recurring && recurrenceFrequency) form.set("recurrenceFrequency", recurrenceFrequency);
    startTransition(() => { datesAction(null, form); });
  }

  return (
    <Dropdown
      width={160}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="text-[13px] text-fg hover:text-brand transition-colors flex items-center gap-1.5">
          <Flag size={12} style={{ color: PRIORITY_COLOR[current] }} /> {PRIORITY_LABEL[current]}
        </button>
      )}
    >
      {[0, 1, 2].map((p) => (
        <DropdownItem key={p} onClick={() => select(p)}>
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5"><Flag size={12} style={{ color: PRIORITY_COLOR[p] }} /> {PRIORITY_LABEL[p]}</span>
            {current === p && <Check size={14} className="text-brand flex-shrink-0" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

function EstimatePopover({
  canAct, estimateMinutes, estimateAction,
}: { canAct: boolean; estimateMinutes: number | null; estimateAction: (minutes: string) => Promise<void> }) {
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(estimateMinutes != null ? String(estimateMinutes) : "");

  if (!canAct) {
    return <span className="text-[13px] text-fg-muted">{estimateMinutes != null ? `${estimateMinutes} min` : "—"}</span>;
  }

  return (
    <Dropdown
      width={160}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="text-[13px] hover:text-brand transition-colors">
          {estimateMinutes != null ? <span className="text-fg">{estimateMinutes} min</span> : <span className="text-fg-muted">Vazio</span>}
        </button>
      )}
    >
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startTransition(() => estimateAction(value))}
          placeholder="min"
        />
        <button
          type="button"
          onClick={() => startTransition(() => estimateAction(value))}
          className="h-9 px-2.5 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors flex-shrink-0"
        >
          OK
        </button>
      </div>
    </Dropdown>
  );
}
