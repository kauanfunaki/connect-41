"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, MoreHorizontal } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { StatusDot } from "@/components/shared/StatusDot";
import { TagToggleList } from "@/components/kanban/TagToggleList";
import { AssigneeToggleList } from "@/components/kanban/AssigneeToggleList";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type StageOption = { id: string; name: string };
type TagOption = { id: string; name: string; color: string };
type UserOption = { id: string; name: string };

type Props = {
  canAct: boolean;
  canDelete: boolean;
  itemId: string;
  entityName: string;

  stages: StageOption[];
  currentStageId: string;
  moveAction: (itemId: string, newStageId: string) => Promise<void>;

  dueDate: string | null;
  priority: number;
  prazoAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;

  allTags: TagOption[];
  selectedTagIds: string[];
  tagToggleAction: (tagId: string, marcado: boolean) => Promise<void>;

  allUsers: UserOption[];
  selectedUserIds: string[];
  assigneeToggleAction: (userId: string, marcado: boolean) => Promise<void>;

  deleteAction: () => Promise<void>;
};

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// Botão-gatilho compacto e uniforme para todos os popovers da barra de ações.
function TriggerButton({
  open,
  disabled,
  onClick,
  children,
}: {
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[12px] font-medium whitespace-nowrap transition-colors disabled:opacity-60 ${
        open
          ? "bg-surface border-border-strong text-fg shadow-sm"
          : "bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong"
      }`}
    >
      {children}
      <ChevronDown size={12} className="text-fg-muted flex-shrink-0" />
    </button>
  );
}

function StagePopover({
  itemId,
  stages,
  currentStageId,
  moveAction,
}: Pick<Props, "itemId" | "stages" | "currentStageId" | "moveAction">) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(currentStageId);
  const currentName = stages.find((s) => s.id === current)?.name ?? "—";

  function select(stageId: string) {
    if (stageId === current) return;
    setCurrent(stageId);
    startTransition(() => {
      moveAction(itemId, stageId);
    });
  }

  return (
    <Dropdown
      width={200}
      trigger={({ open, toggle }) => (
        <TriggerButton open={open} onClick={toggle} disabled={isPending}>
          {currentName}
        </TriggerButton>
      )}
    >
      {stages.map((s) => (
        <DropdownItem key={s.id} onClick={() => select(s.id)}>
          <span className="flex items-center justify-between gap-2">
            {s.name}
            {current === s.id && <Check size={14} className="text-brand flex-shrink-0" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

function DueDatePopover({
  dueDate,
  priority,
  prazoAction,
}: Pick<Props, "dueDate" | "priority" | "prazoAction">) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(dueDate ? dueDate.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);

  function save(next: string) {
    setValue(next);
    setError(null);
    const form = new FormData();
    form.set("dueDate", next);
    form.set("priority", String(priority));
    startTransition(async () => {
      const res = await prazoAction(null, form);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <Dropdown
      width={220}
      trigger={({ open, toggle }) => (
        <TriggerButton open={open} onClick={toggle} disabled={isPending}>
          {value ? formatDueDate(value) : "Prazo"}
        </TriggerButton>
      )}
    >
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-fg-muted">Prazo</label>
        <input
          type="date"
          value={value}
          onChange={(e) => save(e.target.value)}
          className="w-full h-9 px-2.5 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
        />
        {value && (
          <button
            type="button"
            onClick={() => save("")}
            className="text-[11px] text-fg-muted hover:text-danger transition-colors"
          >
            Remover prazo
          </button>
        )}
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    </Dropdown>
  );
}

function PriorityPopover({
  dueDate,
  priority,
  prazoAction,
}: Pick<Props, "dueDate" | "priority" | "prazoAction">) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(priority);

  function select(next: number) {
    if (next === current) return;
    setCurrent(next);
    const form = new FormData();
    form.set("dueDate", dueDate ? dueDate.slice(0, 10) : "");
    form.set("priority", String(next));
    startTransition(() => {
      prazoAction(null, form);
    });
  }

  return (
    <Dropdown
      width={160}
      trigger={({ open, toggle }) => (
        <TriggerButton open={open} onClick={toggle} disabled={isPending}>
          <StatusDot color={PRIORITY_COLOR[current]} label={PRIORITY_LABEL[current]} />
        </TriggerButton>
      )}
    >
      {[0, 1, 2].map((p) => (
        <DropdownItem key={p} onClick={() => select(p)}>
          <span className="flex items-center justify-between gap-2">
            <StatusDot color={PRIORITY_COLOR[p]} label={PRIORITY_LABEL[p]} />
            {current === p && <Check size={14} className="text-brand flex-shrink-0" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

function TagsPopover({
  allTags,
  selectedTagIds,
  tagToggleAction,
}: Pick<Props, "allTags" | "selectedTagIds" | "tagToggleAction">) {
  const selectedCount = allTags.filter((t) => selectedTagIds.includes(t.id)).length;

  return (
    <Dropdown
      width={260}
      trigger={({ open, toggle }) => (
        <TriggerButton open={open} onClick={toggle}>
          Tags{selectedCount > 0 ? ` · ${selectedCount}` : ""}
        </TriggerButton>
      )}
    >
      <TagToggleList allTags={allTags} selectedIds={selectedTagIds} toggleAction={tagToggleAction} />
    </Dropdown>
  );
}

function AssigneesPopover({
  allUsers,
  selectedUserIds,
  assigneeToggleAction,
}: Pick<Props, "allUsers" | "selectedUserIds" | "assigneeToggleAction">) {
  const selectedCount = allUsers.filter((u) => selectedUserIds.includes(u.id)).length;

  return (
    <Dropdown
      width={260}
      trigger={({ open, toggle }) => (
        <TriggerButton open={open} onClick={toggle}>
          Responsáveis{selectedCount > 0 ? ` · ${selectedCount}` : ""}
        </TriggerButton>
      )}
    >
      <AssigneeToggleList allUsers={allUsers} selectedIds={selectedUserIds} toggleAction={assigneeToggleAction} />
    </Dropdown>
  );
}

function MoreMenu({ entityName, deleteAction }: Pick<Props, "entityName" | "deleteAction">) {
  async function handleDelete() {
    if (!confirm(`Remover "${entityName}" deste kanban? Esta ação não pode ser desfeita.`)) return;
    await deleteAction();
  }

  return (
    <Dropdown
      align="right"
      width={180}
      trigger={({ open, toggle }) => (
        <IconButton active={open} onClick={toggle} aria-label="Mais opções">
          <MoreHorizontal size={16} />
        </IconButton>
      )}
    >
      <DropdownItem danger onClick={handleDelete}>
        Remover item
      </DropdownItem>
    </Dropdown>
  );
}

// Barra de ações estilo Trello: cada campo administrativo vira um botão que abre
// um popover pequeno, no lugar dos blocos grandes sempre abertos.
export function CardActionBar({
  canAct,
  canDelete,
  itemId,
  entityName,
  stages,
  currentStageId,
  moveAction,
  dueDate,
  priority,
  prazoAction,
  allTags,
  selectedTagIds,
  tagToggleAction,
  allUsers,
  selectedUserIds,
  assigneeToggleAction,
  deleteAction,
}: Props) {
  if (!canAct) {
    const stageName = stages.find((s) => s.id === currentStageId)?.name ?? "—";
    const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));
    const selectedUsers = allUsers.filter((u) => selectedUserIds.includes(u.id));

    return (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center h-9 px-3 rounded-lg border border-border bg-surface-hover text-[12px] font-medium text-fg-secondary">
          {stageName}
        </span>
        <span className="inline-flex items-center h-9 px-3 rounded-lg border border-border bg-surface-hover text-[12px] font-medium text-fg-secondary">
          {dueDate ? formatDueDate(dueDate.slice(0, 10)) : "Sem prazo"}
        </span>
        <span className="inline-flex items-center h-9 px-3 rounded-lg border border-border bg-surface-hover">
          <StatusDot color={PRIORITY_COLOR[priority]} label={PRIORITY_LABEL[priority]} />
        </span>
        {selectedTags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center h-9 px-3 rounded-lg text-[12px] font-medium"
            style={{ background: `${t.color}1A`, color: t.color }}
          >
            {t.name}
          </span>
        ))}
        {selectedUsers.length > 0 && (
          <span className="inline-flex items-center h-9 px-3 rounded-lg border border-border bg-surface-hover text-[12px] font-medium text-fg-secondary">
            {selectedUsers.map((u) => u.name).join(", ")}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <StagePopover itemId={itemId} stages={stages} currentStageId={currentStageId} moveAction={moveAction} />
      <DueDatePopover dueDate={dueDate} priority={priority} prazoAction={prazoAction} />
      <PriorityPopover dueDate={dueDate} priority={priority} prazoAction={prazoAction} />
      <TagsPopover allTags={allTags} selectedTagIds={selectedTagIds} tagToggleAction={tagToggleAction} />
      <AssigneesPopover allUsers={allUsers} selectedUserIds={selectedUserIds} assigneeToggleAction={assigneeToggleAction} />
      {canDelete && (
        <div className="ml-auto">
          <MoreMenu entityName={entityName} deleteAction={deleteAction} />
        </div>
      )}
    </div>
  );
}
