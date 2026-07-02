"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type Stage = { id: string; name: string; color: string | null };
type Item = {
  id: string;
  stageId: string;
  entityName: string;
  priority: number;
  dueDate: string | null;
};

type Props = {
  pipelineId: string;
  stages: Stage[];
  items: Item[];
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
};

const FALLBACK_COLOR = "#586577";

export function KanbanBoard({ pipelineId, stages, items: initialItems, moveAction }: Props) {
  const [items, setItems] = useState(initialItems);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
    <div className="flex gap-4 h-full overflow-x-auto pb-4">
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
            className={`flex-shrink-0 w-[268px] flex flex-col rounded-lg border transition-[border-color,background-color] duration-150 ${
              isDragOver ? "border-brand/50 bg-brand/[0.04]" : "border-border bg-surface-2/30"
            }`}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 h-10 border-b border-border flex-shrink-0">
              <span
                className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <h3 className="text-[12px] font-medium text-fg-secondary flex-1 truncate tracking-[-0.005em]">
                {stage.name}
              </h3>
              <span className="text-[11px] text-fg-muted tnum leading-none px-1.5 py-0.5 rounded-full bg-surface border border-border">
                {stageItems.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[100px]">
              {stageItems.length === 0 && (
                <div
                  className={`h-16 rounded-md border border-dashed flex items-center justify-center text-[11px] transition-colors ${
                    isDragOver ? "border-brand/40 text-brand" : "border-border text-fg-muted/70"
                  }`}
                >
                  {isDragOver ? "Soltar aqui" : "Nenhum item"}
                </div>
              )}

              {stageItems.map((item, i) => (
                <Link
                  key={item.id}
                  href={`/kanban/${pipelineId}/itens/${item.id}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", item.id);
                    setDraggingId(item.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  style={{
                    borderLeftColor: color,
                    animationDelay: `${Math.min(i, 8) * 25}ms`,
                  }}
                  className={`kanban-card-enter group block bg-surface border border-border border-l-[3px] rounded-md pl-3 pr-3 py-2.5 cursor-grab active:cursor-grabbing transition-[border-color,box-shadow,opacity] duration-150 hover:border-border-strong hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)] ${
                    draggingId === item.id ? "opacity-40" : ""
                  }`}
                >
                  <p className="text-[13px] font-medium text-fg leading-snug truncate group-hover:text-fg transition-colors">
                    {item.entityName}
                  </p>
                  {(item.dueDate || item.priority > 0) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {item.dueDate && (
                        <span className="text-[11px] text-fg-muted tnum">
                          {new Date(item.dueDate).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      )}
                      {item.priority > 0 && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                          {item.priority >= 2 ? "Urgente" : "Alta"}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
