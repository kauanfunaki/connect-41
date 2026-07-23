"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Repeat } from "lucide-react";
import { formatCalendarDate } from "@/lib/format";
import { Input } from "@/components/ui/Input";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";

export type AssigneeRow = { id: string; name: string; priority: number };
export type SubtaskRow = {
  id: string; stageId: string; entityName: string; stageName: string; isTerminal: boolean; priority: number;
  assignees?: AssigneeRow[]; dueDate?: string | null; tags?: { id: string; name: string; color: string }[]; recurring?: boolean;
};
export type TaskRow = {
  id: string;
  stageId: string;
  entityName: string;
  priority: number;
  dueDate: string | null;
  recurring?: boolean;
  tags?: { id: string; name: string; color: string }[];
  assignees?: AssigneeRow[];
  subtasks?: SubtaskRow[];
};
export type StageOption = { id: string; name: string; color: string | null; isTerminal?: boolean; type?: StageDotType };

// Estágios ainda não migrados (type nulo/undefined) caem no fallback derivado
// do isTerminal binário antigo — evita quebrar boards criados antes do campo existir.
function resolveStageType(isTerminal: boolean, type?: StageDotType): StageDotType {
  return type ?? (isTerminal ? "DONE" : "NOT_STARTED");
}

type Props = {
  basePath: string;
  pipelineId: string;
  stages: StageOption[];
  items: TaskRow[];
  canAct: boolean;
  renameStageAction: (stageId: string, name: string) => Promise<void>;
  createTaskAction: (stageId: string, title: string) => Promise<void>;
  priorityAction: (itemId: string, userId: string, priority: number) => Promise<void>;
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
  reorderAction: (itemId: string, direction: "up" | "down") => Promise<void>;
  concluirAction: (pipelineId: string, itemId: string) => Promise<void>;
  reabrirAction: (pipelineId: string, itemId: string) => Promise<void>;
};

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

function isOverdue(dueDate: string | null | undefined): boolean {
  return !!dueDate && new Date(dueDate).getTime() < Date.now();
}

function AssigneeAvatar({ a, itemId, canAct, priorityAction }: { a: AssigneeRow; itemId: string; canAct: boolean; priorityAction: Props["priorityAction"] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <span className="relative">
      <button
        type="button"
        title={`${a.name} · ${PRIORITY_LABEL[a.priority] ?? "Normal"}`}
        onClick={(e) => {
          if (!canAct) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-5 h-5 rounded-full bg-surface-hover border-2 flex items-center justify-center text-[9px] font-medium text-fg-secondary"
        style={{ borderColor: PRIORITY_COLOR[a.priority] ?? PRIORITY_COLOR[0] }}
      >
        {a.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20 top-full right-0 mt-1 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] p-1 w-32"
        >
          {[0, 1, 2].map((p) => (
            <button
              key={p}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                startTransition(() => priorityAction(itemId, a.id, p));
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
            >
              <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: PRIORITY_COLOR[p] }} />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Row({
  item, basePath, depth = 0, canAct, priorityAction, pipelineId, concluirAction, reabrirAction, stages, dragId, onDragStartRow, onDragEndRow, onDropOnRow,
}: {
  item: TaskRow | SubtaskRow;
  basePath: string;
  depth?: number;
  canAct: boolean;
  priorityAction: Props["priorityAction"];
  pipelineId: string;
  concluirAction: Props["concluirAction"];
  reabrirAction: Props["reabrirAction"];
  stages: StageOption[];
  dragId: string | null;
  onDragStartRow: (id: string) => void;
  onDragEndRow: () => void;
  onDropOnRow?: (targetId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const hasSubtasks = "subtasks" in item && item.subtasks && item.subtasks.length > 0;
  const dueDate = item.dueDate;
  const assignees = item.assignees ?? [];
  const stage = stages.find((s) => s.id === item.stageId);
  const isTerminal = "isTerminal" in item ? item.isTerminal : (stage?.isTerminal ?? false);
  const stageColor = stage?.color ?? "var(--c41-fg-muted)";
  const stageType = resolveStageType(isTerminal, stage?.type);
  const tags = item.tags ?? [];
  const dragging = dragId === item.id;

  return (
    <>
      <tr
        draggable={canAct}
        onDragStart={() => onDragStartRow(item.id)}
        onDragEnd={onDragEndRow}
        onDragOver={onDropOnRow ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
        onDrop={onDropOnRow ? (e) => { e.preventDefault(); e.stopPropagation(); onDropOnRow(item.id); } : undefined}
        className={`group hover:bg-surface-hover transition-colors ${dragging ? "opacity-40" : ""} ${canAct ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <td className="py-2 pl-2 pr-1 w-14">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
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

            <button
              type="button"
              disabled={!canAct}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startTransition(() =>
                  isTerminal ? reabrirAction(pipelineId, item.id) : concluirAction(pipelineId, item.id)
                );
              }}
              aria-label={isTerminal ? "Reabrir tarefa" : "Concluir tarefa"}
              title={stage?.name ?? ""}
              className="group/dot flex-shrink-0 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
            >
              <StageDot color={stageColor} type={stageType} showCheckOnHover />
            </button>
          </div>
        </td>

        <td className="py-2 pr-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`${basePath}/itens/${item.id}`}
              className={`text-[13px] text-fg group-hover:text-brand transition-colors truncate min-w-0 ${isTerminal ? "text-fg-muted" : ""}`}
            >
              {item.entityName}
            </Link>
            {hasSubtasks && (
              <span className="text-[11px] text-fg-muted flex-shrink-0 tnum">
                {(item as TaskRow).subtasks!.filter((s) => s.isTerminal).length}/{(item as TaskRow).subtasks!.length}
              </span>
            )}
          </div>
        </td>

        <td className="py-2 pr-2 w-44">
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tags.slice(0, 2).map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: `${t.color}1A`, color: t.color }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </td>

        <td className="py-2 pr-2 w-24">
          {assignees.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {assignees.slice(0, 3).map((a) => (
                <AssigneeAvatar key={a.id} a={a} itemId={item.id} canAct={canAct} priorityAction={priorityAction} />
              ))}
            </div>
          )}
        </td>

        <td className="py-2 pr-2 w-24 text-right">
          {dueDate && (
            <span className={`inline-flex items-center gap-1 text-[11px] tnum ${isOverdue(dueDate) ? "text-danger font-semibold" : "text-fg-muted"}`}>
              {item.recurring && <Repeat size={10} />}
              {formatCalendarDate(new Date(dueDate), { day: "2-digit", month: "short" })}
            </span>
          )}
        </td>
      </tr>

      {expanded && hasSubtasks && (item as TaskRow).subtasks!.map((s) => (
        <Row
          key={s.id}
          item={s}
          basePath={basePath}
          depth={depth + 1}
          canAct={canAct}
          priorityAction={priorityAction}
          pipelineId={pipelineId}
          concluirAction={concluirAction}
          reabrirAction={reabrirAction}
          stages={stages}
          dragId={dragId}
          onDragStartRow={onDragStartRow}
          onDragEndRow={onDragEndRow}
        />
      ))}
    </>
  );
}

function StageGroup({
  stage, items, basePath, canAct, renameStageAction, createTaskAction, priorityAction, pipelineId, concluirAction, reabrirAction, stages,
  dragId, onDragStartRow, onDragEndRow, onDropStage, onDropOnRow,
}: {
  stage: StageOption;
  items: TaskRow[];
  basePath: string;
  canAct: boolean;
  renameStageAction: Props["renameStageAction"];
  createTaskAction: Props["createTaskAction"];
  priorityAction: Props["priorityAction"];
  pipelineId: string;
  concluirAction: Props["concluirAction"];
  reabrirAction: Props["reabrirAction"];
  stages: StageOption[];
  dragId: string | null;
  onDragStartRow: (id: string) => void;
  onDragEndRow: () => void;
  onDropStage: (stageId: string) => void;
  onDropOnRow: (targetId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(stage.name);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();

  function saveName() {
    setEditingName(false);
    if (nameValue.trim() && nameValue.trim() !== stage.name) {
      startTransition(() => renameStageAction(stage.id, nameValue.trim()));
    } else {
      setNameValue(stage.name);
    }
  }

  function addTask() {
    const title = newTitle.trim();
    if (!title) { setAdding(false); return; }
    startTransition(() => createTaskAction(stage.id, title));
    setNewTitle("");
  }

  return (
    <tbody
      className={dragOver ? "bg-brand/[0.05]" : undefined}
      onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (dragId) onDropStage(stage.id);
      }}
    >
      <tr className="border-t border-border first:border-t-0">
        <td colSpan={5} className="pt-3 pb-1.5 px-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-fg-muted hover:text-fg flex-shrink-0">
              <ChevronDown size={13} className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            </button>
            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: stage.color ?? "#586577" }} />
            {editingName && canAct ? (
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setNameValue(stage.name); setEditingName(false); }
                }}
                autoFocus
                className="h-6 w-40 text-[12px]"
              />
            ) : (
              <h3
                onClick={() => canAct && setEditingName(true)}
                className={`text-[12px] font-semibold text-fg-secondary uppercase tracking-wide ${canAct ? "cursor-text hover:text-fg" : ""}`}
              >
                {stage.name}
              </h3>
            )}
            <span className="text-[11px] text-fg-muted tnum">{items.length}</span>
          </div>
        </td>
      </tr>

      {!collapsed && (
        <>
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              basePath={basePath}
              canAct={canAct}
              priorityAction={priorityAction}
              pipelineId={pipelineId}
              concluirAction={concluirAction}
              reabrirAction={reabrirAction}
              stages={stages}
              dragId={dragId}
              onDragStartRow={onDragStartRow}
              onDragEndRow={onDragEndRow}
              onDropOnRow={onDropOnRow}
            />
          ))}

          {items.length === 0 && dragId && (
            <tr>
              <td colSpan={5} className="h-8" style={{ paddingLeft: "34px" }}>
                <p className="text-[11px] text-fg-muted">Solte aqui para mover</p>
              </td>
            </tr>
          )}

          {canAct && (
            <tr>
              <td colSpan={5} className="px-2 py-1.5" style={{ paddingLeft: "34px" }}>
                {adding ? (
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTask();
                      if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
                    }}
                    onBlur={() => { if (!newTitle.trim()) setAdding(false); }}
                    autoFocus
                    placeholder="Nome da tarefa…"
                    className="h-8 max-w-xs"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    + Adicionar Tarefa
                  </button>
                )}
              </td>
            </tr>
          )}
        </>
      )}
    </tbody>
  );
}

// Distância da borda (px) que já dispara o auto-scroll, e velocidade máxima.
const EDGE_ZONE = 80;
const MAX_SCROLL_SPEED = 18;

// Visão alternativa ao Kanban: mesmas tarefas, agrupadas por status (stage) em
// vez de colunas, numa tabela real (colunas fixas: Tarefa/Tags/Responsáveis/
// Prazo, header sticky) — status renomeável inline, grupos colapsáveis,
// criação rápida por status. Mudar o status de uma tarefa é feito arrastando
// a linha pra outro grupo (mesma linguagem do quadro Kanban); soltar em cima
// de outra tarefa do MESMO grupo reordena (troca adjacente, igual ao checklist).
export function TaskListView({ basePath, pipelineId, stages, items, canAct, renameStageAction, createTaskAction, priorityAction, moveAction, reorderAction, concluirAction, reabrirAction }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSpeedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const byStage = stages.map((stage) => ({
    stage,
    items: items.filter((i) => i.stageId === stage.id),
  }));

  function handleDropStage(stageId: string) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    startTransition(() => moveAction(id, stageId));
  }

  function handleDropOnRow(targetId: string) {
    const id = dragId;
    setDragId(null);
    if (!id || id === targetId) return;
    const source = items.find((i) => i.id === id);
    const target = items.find((i) => i.id === targetId);
    if (!source || !target) return;
    if (source.stageId !== target.stageId) {
      startTransition(() => moveAction(id, target.stageId));
      return;
    }
    const siblings = items.filter((i) => i.stageId === target.stageId);
    const fromIndex = siblings.findIndex((i) => i.id === id);
    const toIndex = siblings.findIndex((i) => i.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    startTransition(async () => {
      for (let i = 0; i < steps; i++) await reorderAction(id, direction);
    });
  }

  // Auto-scroll ao arrastar perto das bordas — ouve dragover no documento
  // inteiro (não só no container) pra não depender de qual linha específica
  // está sob o cursor no momento.
  useEffect(() => {
    if (!dragId) return;

    function stop() {
      scrollSpeedRef.current = 0;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function tick() {
      const el = scrollRef.current;
      if (el && scrollSpeedRef.current !== 0) {
        el.scrollTop += scrollSpeedRef.current;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    }

    function onDocDragOver(e: DragEvent) {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = e.clientY;
      let speed = 0;
      if (y >= rect.top && y < rect.top + EDGE_ZONE) {
        speed = -MAX_SCROLL_SPEED * (1 - (y - rect.top) / EDGE_ZONE);
      } else if (y <= rect.bottom && y > rect.bottom - EDGE_ZONE) {
        speed = MAX_SCROLL_SPEED * (1 - (rect.bottom - y) / EDGE_ZONE);
      }
      scrollSpeedRef.current = speed;
      if (speed !== 0 && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    document.addEventListener("dragover", onDocDragOver);
    document.addEventListener("dragend", stop);
    document.addEventListener("drop", stop);
    return () => {
      document.removeEventListener("dragover", onDocDragOver);
      document.removeEventListener("dragend", stop);
      document.removeEventListener("drop", stop);
      stop();
    };
  }, [dragId]);

  return (
    <div
      ref={scrollRef}
      className="scroll-y bg-surface border border-border rounded-2xl p-2 h-full overflow-y-auto"
    >
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-surface z-10">
          <tr className="text-left">
            <th className="w-14" />
            <th className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide pb-1.5 px-2">Tarefa</th>
            <th className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide pb-1.5 px-2 w-44">Tags</th>
            <th className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide pb-1.5 px-2 w-24">Responsáveis</th>
            <th className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide pb-1.5 px-2 w-24 text-right">Prazo</th>
          </tr>
        </thead>
        {byStage.map(({ stage, items: stageItems }) => (
          <StageGroup
            key={stage.id}
            stage={stage}
            items={stageItems}
            basePath={basePath}
            canAct={canAct}
            renameStageAction={renameStageAction}
            createTaskAction={createTaskAction}
            priorityAction={priorityAction}
            pipelineId={pipelineId}
            concluirAction={concluirAction}
            reabrirAction={reabrirAction}
            stages={stages}
            dragId={dragId}
            onDragStartRow={setDragId}
            onDragEndRow={() => setDragId(null)}
            onDropStage={handleDropStage}
            onDropOnRow={handleDropOnRow}
          />
        ))}
      </table>
    </div>
  );
}
