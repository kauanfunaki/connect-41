"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { StatusDot } from "@/components/shared/StatusDot";
import { formatCalendarDate } from "@/lib/format";

type Stage = { id: string; name: string; color: string | null; isTerminal?: boolean };
type Tag = { id: string; name: string; color: string };
type Assignee = { id: string; name: string };
type Item = {
  id: string;
  stageId: string;
  entityName: string;
  priority: number;
  dueDate: string | null;
  tags?: Tag[];
  assignees?: Assignee[];
  daysInStage?: number;
  lastActivity?: string | null;
  subtaskTotal?: number;
  subtaskDone?: number;
};

type Props = {
  pipelineId: string;
  stages: Stage[];
  items: Item[];
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
  /** Base do link do card — default `/kanban/{pipelineId}`. Setores com módulo
   * dedicado (ex. BPO em /bpo-financeiro) passam a própria base aqui. */
  basePath?: string;
};

const FALLBACK_COLOR = "#586577";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function isOverdue(dueDate: string | null, isTerminal?: boolean): boolean {
  if (!dueDate || isTerminal) return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function KanbanBoard({ pipelineId, stages, items: initialItems, moveAction, basePath }: Props) {
  const base = basePath ?? `/kanban/${pipelineId}`;
  const [items, setItems] = useState(initialItems);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(stageId: string, itemId: string) {
    setDragOverStage(null);
    setDraggingId(null);
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, stageId } : i)));
    startTransition(() => {
      moveAction(itemId, stageId);
    });
  }

  return (
    <div className="scroll-x bg-surface border border-border rounded-2xl p-4 h-full overflow-x-auto flex gap-3">
      {stages.map((stage) => {
        const color = stage.color ?? FALLBACK_COLOR;
        const stageItems = items.filter((i) => i.stageId === stage.id);
        const isDragOver = dragOverStage === stage.id;

        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(stage.id);
            }}
            onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              const itemId = e.dataTransfer.getData("text/plain");
              if (itemId) handleDrop(stage.id, itemId);
            }}
            className={`flex-1 min-w-[268px] max-w-[340px] flex flex-col rounded-xl border transition-[outline-color,background-color] duration-150 ${
              isDragOver ? "bg-brand-subtle outline outline-2 outline-dashed outline-brand -outline-offset-2 border-transparent" : "border-border bg-canvas"
            }`}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 h-11 border-b border-border flex-shrink-0">
              <span
                className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <h3 className="text-[length:var(--fs-kanban-title)] font-medium text-fg-secondary flex-1 truncate tracking-[-0.005em]">
                {stage.name}
              </h3>
              <span className="text-[11px] font-semibold text-fg-muted tnum leading-none px-2 py-1 rounded-full bg-surface-hover">
                {stageItems.length}
              </span>
            </div>

            {/* Cards */}
            <div className="scroll-y flex-1 overflow-y-auto p-2.5 space-y-2 min-h-[100px]">
              {stageItems.length === 0 && (
                <div
                  className={`h-16 rounded-xl border-[1.5px] border-dashed flex items-center justify-center text-[12px] transition-colors ${
                    isDragOver ? "border-brand text-brand" : "border-border-strong text-fg-muted"
                  }`}
                >
                  {isDragOver ? "Soltar aqui" : "Nenhum item"}
                </div>
              )}

              {stageItems.map((item, i) => {
                const overdue = isOverdue(item.dueDate, stage.isTerminal);
                return (
                  <Link
                    key={item.id}
                    href={`${base}/itens/${item.id}`}
                    draggable
                    onMouseDown={() => setSelectedId(item.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", item.id);
                      setDraggingId(item.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    style={{
                      borderLeftColor: color,
                      animationDelay: `${Math.min(i, 8) * 25}ms`,
                    }}
                    className={`kanban-card-enter group block bg-surface border border-l-[3px] rounded-xl pl-3 pr-3 py-3 cursor-grab active:cursor-grabbing transition-[border-color,box-shadow,opacity,background-color] duration-150 hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] ${
                      selectedId === item.id
                        ? "border-brand shadow-[0_0_0_3px_var(--c41-brand-subtle)]"
                        : "border-border hover:border-border-strong"
                    } ${draggingId === item.id ? "opacity-90 shadow-[var(--c41-shadow-lg)] rotate-[-1.5deg]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[length:var(--fs-kanban-title)] font-semibold text-fg leading-snug truncate group-hover:text-fg transition-colors">
                        {item.entityName}
                      </p>
                      {item.daysInStage !== undefined && (
                        <span className="text-[length:var(--fs-kanban-meta)] text-fg-muted tnum flex-shrink-0 leading-snug">
                          {item.daysInStage}d
                        </span>
                      )}
                    </div>

                    {item.subtaskTotal !== undefined && item.subtaskTotal > 0 && (
                      <p className="text-[length:var(--fs-kanban-meta)] text-fg-muted mt-1.5">
                        {item.subtaskDone}/{item.subtaskTotal} subtarefas
                      </p>
                    )}

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {item.tags.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: `${t.color}1A`, color: t.color }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {(item.dueDate || item.priority > 0 || (item.assignees && item.assignees.length > 0)) && (
                      <div className="flex items-center justify-between gap-1.5 mt-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.dueDate && (
                            <span
                              className={`text-[length:var(--fs-kanban-meta)] tnum ${overdue ? "text-danger font-semibold" : "text-fg-muted"}`}
                            >
                              {overdue && "⚠ "}
                              {formatCalendarDate(new Date(item.dueDate), {
                                day: "2-digit",
                                month: "short",
                              })}
                            </span>
                          )}
                          {item.priority > 0 && (
                            <StatusDot
                              color="var(--c41-warning)"
                              label={item.priority >= 2 ? "Urgente" : "Alta"}
                              className="text-[length:var(--fs-kanban-meta)]"
                            />
                          )}
                        </div>

                        {item.assignees && item.assignees.length > 0 && (
                          <div className="flex items-center -space-x-1.5 flex-shrink-0">
                            {item.assignees.slice(0, 3).map((a) => (
                              <span
                                key={a.id}
                                title={a.name}
                                className="w-5 h-5 rounded-full bg-surface-hover border border-border text-[9px] font-medium text-fg-secondary flex items-center justify-center"
                              >
                                {initials(a.name)}
                              </span>
                            ))}
                            {item.assignees.length > 3 && (
                              <span className="w-5 h-5 rounded-full bg-surface-hover border border-border text-[9px] font-medium text-fg-muted flex items-center justify-center">
                                +{item.assignees.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {item.lastActivity && (
                      <p className="text-[11px] text-fg-muted mt-2 pt-2 border-t border-border truncate">
                        {item.lastActivity}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
