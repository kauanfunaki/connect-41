"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCalendarDate } from "@/lib/format";

export type SubtaskRow = { id: string; entityName: string; stageName: string; isTerminal: boolean; priority: number };
export type TaskRow = {
  id: string;
  stageId: string;
  entityName: string;
  priority: number;
  dueDate: string | null;
  assignees?: { id: string; name: string }[];
  subtasks?: SubtaskRow[];
};
export type StageOption = { id: string; name: string; color: string | null; isTerminal?: boolean };

type Props = {
  basePath: string;
  stages: StageOption[];
  items: TaskRow[];
};

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

function isOverdue(dueDate: string | null): boolean {
  return !!dueDate && new Date(dueDate).getTime() < Date.now();
}

function Row({ item, basePath, depth = 0 }: { item: TaskRow | SubtaskRow; basePath: string; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasSubtasks = "subtasks" in item && item.subtasks && item.subtasks.length > 0;
  const dueDate = "dueDate" in item ? item.dueDate : null;
  const assignees = "assignees" in item ? item.assignees ?? [] : [];
  const statusLabel = "stageName" in item ? item.stageName : undefined;

  return (
    <>
      <div
        className="flex items-center gap-3 py-2 px-2 hover:bg-surface-hover rounded-lg transition-colors group"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {hasSubtasks ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-fg-muted hover:text-fg flex-shrink-0"
            aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
          >
            <ChevronRight size={14} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-[14px] flex-shrink-0" />
        )}

        <span
          className="w-[7px] h-[7px] rounded-full flex-shrink-0"
          style={{ background: PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR[0] }}
          title={PRIORITY_LABEL[item.priority] ?? "Normal"}
        />

        <Link
          href={`${basePath}/itens/${item.id}`}
          className="text-[13px] text-fg group-hover:text-brand transition-colors truncate flex-1 min-w-0"
        >
          {item.entityName}
        </Link>

        {statusLabel && (
          <span className="text-[11px] text-fg-muted flex-shrink-0 hidden sm:inline">{statusLabel}</span>
        )}

        {hasSubtasks && (
          <span className="text-[11px] text-fg-muted flex-shrink-0 tnum">
            {(item as TaskRow).subtasks!.filter((s) => s.isTerminal).length}/{(item as TaskRow).subtasks!.length}
          </span>
        )}

        {assignees.length > 0 && (
          <div className="flex items-center -space-x-1.5 flex-shrink-0">
            {assignees.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.name}
                className="w-5 h-5 rounded-full bg-surface-hover border border-border text-[9px] font-medium text-fg-secondary flex items-center justify-center"
              >
                {a.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {dueDate && (
          <span className={`text-[11px] tnum flex-shrink-0 w-16 text-right ${isOverdue(dueDate) ? "text-danger font-semibold" : "text-fg-muted"}`}>
            {formatCalendarDate(new Date(dueDate), { day: "2-digit", month: "short" })}
          </span>
        )}
      </div>

      {expanded && hasSubtasks && (
        <div>
          {(item as TaskRow).subtasks!.map((s) => (
            <Row key={s.id} item={s} basePath={basePath} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

// Visão alternativa ao Kanban: mesmas tarefas, agrupadas por status (stage) em
// vez de colunas — expande subtarefas inline, sem precisar abrir a tarefa.
export function TaskListView({ basePath, stages, items }: Props) {
  const byStage = stages.map((stage) => ({
    stage,
    items: items.filter((i) => i.stageId === stage.id),
  }));

  return (
    <div className="scroll-y bg-surface border border-border rounded-2xl p-2 h-full overflow-y-auto">
      {byStage.map(({ stage, items: stageItems }) => (
        <div key={stage.id} className="mb-2 last:mb-0">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: stage.color ?? "#586577" }} />
            <h3 className="text-[12px] font-semibold text-fg-secondary uppercase tracking-wide">{stage.name}</h3>
            <span className="text-[11px] text-fg-muted tnum">{stageItems.length}</span>
          </div>
          {stageItems.length === 0 ? (
            <p className="text-[12px] text-fg-muted px-2 pb-2">Nenhum item</p>
          ) : (
            <div className="divide-y divide-border/60">
              {stageItems.map((item) => (
                <Row key={item.id} item={item} basePath={basePath} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
