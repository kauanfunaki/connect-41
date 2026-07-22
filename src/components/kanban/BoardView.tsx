"use client";

import { useMemo, useState } from "react";
import { Columns3, List } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskListView, type TaskRow, type StageOption } from "@/components/kanban/TaskListView";
import { Select } from "@/components/ui/Select";

type Item = TaskRow & { tags?: { id: string; name: string; color: string }[]; daysInStage?: number; lastActivity?: string | null; subtaskTotal?: number; subtaskDone?: number };

type Props = {
  pipelineId: string;
  basePath: string;
  stages: StageOption[];
  items: Item[];
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
};

const PRIORITY_LABEL: Record<string, string> = { "": "Toda prioridade", "0": "Normal", "1": "Alta", "2": "Urgente" };
const DUE_FILTERS = [
  { value: "", label: "Todo prazo" },
  { value: "overdue", label: "Atrasadas" },
  { value: "today", label: "Vencem hoje" },
  { value: "none", label: "Sem prazo" },
];

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now();
}

export function BoardView({ pipelineId, basePath, stages, items, moveAction }: Props) {
  const [view, setView] = useState<"board" | "list">("board");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");

  const allAssignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      for (const a of item.assignees ?? []) map.set(a.id, a.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (assigneeFilter && !(item.assignees ?? []).some((a) => a.id === assigneeFilter)) return false;
      if (priorityFilter && String(item.priority) !== priorityFilter) return false;
      if (dueFilter === "none" && item.dueDate) return false;
      if (dueFilter === "overdue" && !(item.dueDate && isOverdue(item.dueDate))) return false;
      if (dueFilter === "today" && !(item.dueDate && isToday(new Date(item.dueDate)))) return false;
      return true;
    });
  }, [items, assigneeFilter, priorityFilter, dueFilter]);

  const activeFilterCount = [assigneeFilter, priorityFilter, dueFilter].filter(Boolean).length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3 flex-wrap flex-shrink-0">
        <div className="inline-flex rounded-lg border border-border overflow-hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => setView("board")}
            className={`h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium transition-colors ${
              view === "board" ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            <Columns3 size={14} /> Quadro
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium border-l border-border transition-colors ${
              view === "list" ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            <List size={14} /> Lista
          </button>
        </div>

        {allAssignees.length > 0 && (
          <div className="w-44">
            <Select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">Todo responsável</option>
              {allAssignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="w-36">
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <div className="w-36">
          <Select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
            {DUE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </Select>
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => { setAssigneeFilter(""); setPriorityFilter(""); setDueFilter(""); }}
            className="text-[12px] text-fg-muted hover:text-fg transition-colors"
          >
            Limpar filtros
          </button>
        )}

        <span className="text-[12px] text-fg-muted ml-auto flex-shrink-0">
          {filtered.length} de {items.length}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {view === "board" ? (
          <KanbanBoard pipelineId={pipelineId} basePath={basePath} stages={stages} items={filtered} moveAction={moveAction} />
        ) : (
          <TaskListView basePath={basePath} stages={stages} items={filtered} />
        )}
      </div>
    </div>
  );
}
