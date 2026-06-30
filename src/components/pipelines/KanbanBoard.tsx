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

export function KanbanBoard({ pipelineId, stages, items: initialItems, moveAction }: Props) {
  const [items, setItems] = useState(initialItems);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(stageId: string, itemId: string) {
    setDragOverStage(null);
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, stageId } : i)));
    startTransition(() => {
      moveAction(itemId, stageId);
    });
  }

  return (
    <div className="flex gap-3 h-full overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageItems = items.filter((i) => i.stageId === stage.id);
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
            className={`flex-shrink-0 w-[260px] flex flex-col rounded-lg border transition-colors ${
              dragOverStage === stage.id
                ? "border-brand bg-brand/5"
                : "border-border bg-surface-2/40"
            }`}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: stage.color ?? "#586577" }}
              />
              <h3 className="text-[12px] font-medium text-fg flex-1 truncate">{stage.name}</h3>
              <span className="text-[11px] text-fg-muted tnum">{stageItems.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
              {stageItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/pipelines/${pipelineId}/itens/${item.id}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", item.id);
                  }}
                  className="block bg-surface border border-border rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-border-strong transition-colors"
                >
                  <p className="text-[13px] font-medium text-fg truncate">{item.entityName}</p>
                  {(item.dueDate || item.priority > 0) && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {item.dueDate && (
                        <span className="text-[11px] text-fg-muted tnum">
                          {new Date(item.dueDate).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {item.priority > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                          Prioridade {item.priority}
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
