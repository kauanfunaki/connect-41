"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Selo } from "@/components/ui/Selo";
import { formatCalendarDate } from "@/lib/format";
import { stripRichText } from "@/lib/richText";
import { ColunaDoQuadro } from "./ColunaDoQuadro";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { EtiquetaColorida } from "@/components/ui/EtiquetaColorida";

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
   * dedicado passariam a própria base aqui — hoje não há nenhum. */
  basePath?: string;
};

// Cor de Gestão pelo token (era o hex cru, repetido em 15 lugares). Só vai
// para `style` (bolinha e borda do cartão), então a variável CSS serve.
const FALLBACK_COLOR = "var(--c41-sector-gestao)";

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
    <div className="scroll-x bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-4 h-full overflow-x-auto flex gap-3">
      {stages.map((stage) => {
        const color = stage.color ?? FALLBACK_COLOR;
        const stageItems = items.filter((i) => i.stageId === stage.id);
        const isDragOver = dragOverStage === stage.id;

        return (
          <ColunaDoQuadro
            key={stage.id}
            titulo={stage.name}
            cor={color}
            contagem={stageItems.length}
            vazio={isDragOver ? "Soltar aqui" : "Nenhuma tarefa"}
            destacada={isDragOver}
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
            className="flex-1 min-w-[268px] max-w-[340px]"
          >
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
                  className={`kanban-card-enter group block bg-surface border border-l-[3px] rounded-lg pl-3 pr-3 py-3 cursor-grab active:cursor-grabbing transition-[border-color,box-shadow,opacity,background-color] duration-150 hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] ${
                    selectedId === item.id
                      ? "border-brand shadow-[0_0_0_3px_var(--c41-brand-subtle)]"
                      : "border-border hover:border-border-strong"
                  } ${draggingId === item.id ? "opacity-90 shadow-[var(--c41-shadow-lg)] rotate-[-1.5deg]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-kanban-title font-semibold text-fg leading-snug truncate group-hover:text-fg transition-colors">
                      {item.entityName}
                    </p>
                    {item.daysInStage !== undefined && (
                      <span className="text-kanban-meta text-fg-muted tnum flex-shrink-0 leading-snug">
                        {item.daysInStage}d
                      </span>
                    )}
                  </div>

                  {item.subtaskTotal !== undefined && item.subtaskTotal > 0 && (
                    <p className="text-kanban-meta text-fg-muted mt-1.5">
                      {item.subtaskDone}/{item.subtaskTotal} subtarefas
                    </p>
                  )}

                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {item.tags.map((t) => (
                        <EtiquetaColorida key={t.id} cor={t.color}>
                          {t.name}
                        </EtiquetaColorida>
                      ))}
                    </div>
                  )}

                  {(item.dueDate || item.priority > 0 || (item.assignees && item.assignees.length > 0)) && (
                    <div className="flex items-center justify-between gap-1.5 mt-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.dueDate && (
                          <span
                            className={`text-kanban-meta tnum ${overdue ? "text-danger font-semibold" : "text-fg-muted"}`}
                          >
                            {overdue && "⚠ "}
                            {formatCalendarDate(new Date(item.dueDate), {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        )}
                        {/* Prioridade no Selo, como na fila de processos: a
                            bolinha fica para ativo/inativo de cadastro (2A,
                            08/10/2026). */}
                        {item.priority > 0 && (
                          <Selo tom="atencao">{item.priority >= 2 ? "Urgente" : "Alta"}</Selo>
                        )}
                      </div>

                      {item.assignees && item.assignees.length > 0 && (
                        <div className="flex items-center -space-x-1.5 flex-shrink-0">
                          {/* O `AvatarImage` compartilhado (07/10/2026), com as
                              iniciais em 11px — eram montadas à mão em 9px. */}
                          {item.assignees.slice(0, 3).map((a) => (
                            <span key={a.id} title={a.name} className="rounded-full ring-2 ring-surface">
                              <AvatarImage src={null} name={a.name} size={20} fontSize={11} />
                            </span>
                          ))}
                          {item.assignees.length > 3 && (
                            <span className="w-5 h-5 rounded-full bg-surface-hover border border-border text-micro font-medium text-fg-muted flex items-center justify-center">
                              +{item.assignees.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {item.lastActivity && (
                    <p className="text-fs-1 text-fg-muted mt-2 pt-2 border-t border-border truncate">
                      {stripRichText(item.lastActivity)}
                    </p>
                  )}
                </Link>
              );
            })}
          </ColunaDoQuadro>
        );
      })}
    </div>
  );
}
