"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Columns3, Flag, List, ListFilter, Search, Tag, User, UserCheck } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskListView, type TaskRow, type StageOption } from "@/components/kanban/TaskListView";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

type Item = TaskRow & {
  tags?: { id: string; name: string; color: string }[];
  daysInStage?: number;
  lastActivity?: string | null;
  description?: string | null;
  creator?: { id: string; name: string } | null;
  subtaskTotal?: number;
  subtaskDone?: number;
};

type Props = {
  pipelineId: string;
  basePath: string;
  stages: StageOption[];
  items: Item[];
  canAct: boolean;
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
  renameStageAction: (stageId: string, name: string) => Promise<void>;
  createTaskAction: (stageId: string, title: string) => Promise<void>;
  priorityAction: (itemId: string, userId: string, priority: number) => Promise<void>;
  concluirAction: (pipelineId: string, itemId: string) => Promise<void>;
  reabrirAction: (pipelineId: string, itemId: string) => Promise<void>;
};

const PRIORITY_LABEL: Record<string, string> = { "": "Toda prioridade", "0": "Normal", "1": "Alta", "2": "Urgente" };
const DUE_FILTERS = [
  { value: "", label: "Todo prazo" },
  { value: "overdue", label: "Atrasadas" },
  { value: "today", label: "Vencem hoje" },
  { value: "none", label: "Sem prazo" },
];
const NO_ASSIGNEE = "__sem_responsavel__";

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

export function BoardView({ pipelineId, basePath, stages, items, canAct, moveAction, renameStageAction, createTaskAction, priorityAction, concluirAction, reabrirAction }: Props) {
  const [view, setView] = useState<"board" | "list">("list");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null);

  const allAssignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      for (const a of item.assignees ?? []) map.set(a.id, a.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const allCreators = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.creator) map.set(item.creator.id, item.creator.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const allTags = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const item of items) {
      for (const t of item.tags ?? []) map.set(t.id, { name: t.name, color: t.color });
    }
    return Array.from(map.entries()).map(([id, t]) => ({ id, ...t })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q) {
        const haystack = [
          item.entityName,
          item.description ? stripHtml(item.description) : "",
          ...(item.subtasks ?? []).map((s) => s.entityName),
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (assigneeFilter === NO_ASSIGNEE && (item.assignees ?? []).length > 0) return false;
      if (assigneeFilter && assigneeFilter !== NO_ASSIGNEE && !(item.assignees ?? []).some((a) => a.id === assigneeFilter)) return false;
      if (creatorFilter && item.creator?.id !== creatorFilter) return false;
      if (tagFilter && !(item.tags ?? []).some((t) => t.id === tagFilter)) return false;
      if (priorityFilter && String(item.priority) !== priorityFilter) return false;
      if (dueFilter === "none" && item.dueDate) return false;
      if (dueFilter === "overdue" && !(item.dueDate && isOverdue(item.dueDate))) return false;
      if (dueFilter === "today" && !(item.dueDate && isToday(new Date(item.dueDate)))) return false;
      return true;
    });
  }, [items, search, assigneeFilter, creatorFilter, tagFilter, priorityFilter, dueFilter]);

  const activeFilterCount = [search, assigneeFilter, creatorFilter, tagFilter, priorityFilter, dueFilter].filter(Boolean).length;

  const filterDefs = [
    { key: "assignee", label: "Responsável", icon: <User size={14} />, show: allAssignees.length > 0, active: !!assigneeFilter },
    { key: "creator", label: "Criador", icon: <UserCheck size={14} />, show: allCreators.length > 0, active: !!creatorFilter },
    { key: "tag", label: "Etiqueta", icon: <Tag size={14} />, show: allTags.length > 0, active: !!tagFilter },
    { key: "priority", label: "Prioridade", icon: <Flag size={14} />, show: true, active: !!priorityFilter },
    { key: "due", label: "Prazo", icon: <CalendarClock size={14} />, show: true, active: !!dueFilter },
  ].filter((f) => f.show);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3 flex-wrap flex-shrink-0">
        <div className="inline-flex rounded-lg border border-border overflow-hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium transition-colors ${
              view === "list" ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            <List size={14} /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={`h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium border-l border-border transition-colors ${
              view === "board" ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            <Columns3 size={14} /> Quadro
          </button>
        </div>

        <div className="w-48">
          <Input
            icon={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar título, descrição…"
          />
        </div>

        <button
          type="button"
          onClick={() => { setActiveFilterKey(null); setFilterModalOpen(true); }}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium transition-colors flex-shrink-0 ${
            activeFilterCount - (search ? 1 : 0) > 0
              ? "border-brand/40 bg-brand/[0.06] text-fg"
              : "border-border text-fg-secondary hover:text-fg hover:bg-surface-hover"
          }`}
        >
          <ListFilter size={14} /> Filtros
          {activeFilterCount - (search ? 1 : 0) > 0 && (
            <span className="tnum">({activeFilterCount - (search ? 1 : 0)})</span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearch(""); setAssigneeFilter(""); setCreatorFilter(""); setTagFilter(""); setPriorityFilter(""); setDueFilter("");
            }}
            className="text-[12px] text-fg-muted hover:text-fg transition-colors"
          >
            Limpar filtros
          </button>
        )}

        <span className="text-[12px] text-fg-muted ml-auto flex-shrink-0">
          {filtered.length} de {items.length}
        </span>
      </div>

      <Modal
        open={filterModalOpen}
        onClose={() => { setFilterModalOpen(false); setActiveFilterKey(null); }}
        title="Filtros"
        maxWidth="max-w-sm"
      >
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {filterDefs.map((f) => (
            <button
              key={f.key}
              type="button"
              title={f.label}
              onClick={() => setActiveFilterKey((k) => (k === f.key ? null : f.key))}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${
                f.active || activeFilterKey === f.key
                  ? "border-brand/40 bg-brand/[0.06] text-fg"
                  : "border-border text-fg-secondary hover:text-fg hover:bg-surface-hover"
              }`}
            >
              {f.icon}
            </button>
          ))}
        </div>

        {activeFilterKey === "assignee" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Responsável</p>
            <Select
              autoFocus
              value={assigneeFilter}
              onChange={(e) => { setAssigneeFilter(e.target.value); setFilterModalOpen(false); setActiveFilterKey(null); }}
            >
              <option value="">Todo responsável</option>
              <option value={NO_ASSIGNEE}>Sem responsável</option>
              {allAssignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        )}

        {activeFilterKey === "creator" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Criador</p>
            <Select
              autoFocus
              value={creatorFilter}
              onChange={(e) => { setCreatorFilter(e.target.value); setFilterModalOpen(false); setActiveFilterKey(null); }}
            >
              <option value="">Todo criador</option>
              {allCreators.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        )}

        {activeFilterKey === "tag" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Etiqueta</p>
            <Select
              autoFocus
              value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setFilterModalOpen(false); setActiveFilterKey(null); }}
            >
              <option value="">Toda etiqueta</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
        )}

        {activeFilterKey === "priority" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Prioridade</p>
            <Select
              autoFocus
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setFilterModalOpen(false); setActiveFilterKey(null); }}
            >
              {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        )}

        {activeFilterKey === "due" && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Prazo</p>
            <Select
              autoFocus
              value={dueFilter}
              onChange={(e) => { setDueFilter(e.target.value); setFilterModalOpen(false); setActiveFilterKey(null); }}
            >
              {DUE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </div>
        )}
      </Modal>

      <div className="flex-1 min-h-0">
        {view === "board" ? (
          <KanbanBoard pipelineId={pipelineId} basePath={basePath} stages={stages} items={filtered} moveAction={moveAction} />
        ) : (
          <TaskListView
            basePath={basePath}
            pipelineId={pipelineId}
            stages={stages}
            items={filtered}
            canAct={canAct}
            renameStageAction={renameStageAction}
            createTaskAction={createTaskAction}
            priorityAction={priorityAction}
            moveAction={moveAction}
            concluirAction={concluirAction}
            reabrirAction={reabrirAction}
          />
        )}
      </div>
    </div>
  );
}
