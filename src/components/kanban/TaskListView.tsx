"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, ChevronDown, Repeat } from "lucide-react";
import { formatCalendarDate } from "@/lib/format";
import { Input } from "@/components/ui/Input";

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
export type StageOption = { id: string; name: string; color: string | null; isTerminal?: boolean };

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
  const statusLabel = "stageName" in item ? item.stageName : undefined;
  const tags = item.tags ?? [];
  const dragging = dragId === item.id;

  return (
    <>
      <div
        draggable={canAct}
        onDragStart={() => onDragStartRow(item.id)}
        onDragEnd={onDragEndRow}
        onDragOver={onDropOnRow ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
        onDrop={onDropOnRow ? (e) => { e.preventDefault(); e.stopPropagation(); onDropOnRow(item.id); } : undefined}
        className={`flex items-center gap-2 py-2 px-2 hover:bg-surface-hover rounded-lg transition-colors group ${dragging ? "opacity-40" : ""} ${canAct ? "cursor-grab active:cursor-grabbing" : ""}`}
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
          className="group/dot w-[14px] h-[14px] rounded-full border flex items-center justify-center flex-shrink-0 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
          style={{
            borderColor: stageColor,
            background: isTerminal ? stageColor : "transparent",
          }}
        >
          {isTerminal ? (
            <Check size={9} className="text-on-brand" />
          ) : (
            <Check size={9} className="opacity-0 group-hover/dot:opacity-100 transition-opacity" style={{ color: stageColor }} />
          )}
        </button>

        <Link
          href={`${basePath}/itens/${item.id}`}
          className={`text-[13px] text-fg group-hover:text-brand transition-colors truncate min-w-0 ${isTerminal ? "text-fg-muted" : ""}`}
        >
          {item.entityName}
        </Link>

        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
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

        <div className="flex-1" />

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
              <AssigneeAvatar key={a.id} a={a} itemId={item.id} canAct={canAct} priorityAction={priorityAction} />
            ))}
          </div>
        )}

        {dueDate && (
          <span className={`flex items-center gap-1 text-[11px] tnum flex-shrink-0 w-20 justify-end ${isOverdue(dueDate) ? "text-danger font-semibold" : "text-fg-muted"}`}>
            {item.recurring && <Repeat size={10} />}
            {formatCalendarDate(new Date(dueDate), { day: "2-digit", month: "short" })}
          </span>
        )}
      </div>

      {expanded && hasSubtasks && (
        <div>
          {(item as TaskRow).subtasks!.map((s) => (
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
        </div>
      )}
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
    <div
      className={`mb-2 last:mb-0 rounded-lg transition-colors ${dragOver ? "bg-brand/[0.05] ring-1 ring-brand/30" : ""}`}
      onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (dragId) onDropStage(stage.id);
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
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

      {!collapsed && (
        <>
          {items.length > 0 && (
            <div className="divide-y divide-border/60">
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
            </div>
          )}

          {items.length === 0 && dragId && (
            <div className="h-8 flex items-center px-2" style={{ paddingLeft: "34px" }}>
              <p className="text-[11px] text-fg-muted">Solte aqui para mover</p>
            </div>
          )}

          {canAct && (
            adding ? (
              <div className="flex items-center gap-2 px-2 py-1.5" style={{ paddingLeft: "34px" }}>
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
                  className="h-8 flex-1"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-[12px] text-fg-muted hover:text-fg transition-colors px-2 py-1.5"
                style={{ paddingLeft: "34px" }}
              >
                + Adicionar Tarefa
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

// Distância da borda (px) que já dispara o auto-scroll, e velocidade máxima.
const EDGE_ZONE = 80;
const MAX_SCROLL_SPEED = 18;

// Visão alternativa ao Kanban: mesmas tarefas, agrupadas por status (stage) em
// vez de colunas — status renomeável inline, grupos colapsáveis, criação
// rápida por status. Mudar o status de uma tarefa é feito arrastando a linha
// pra outro grupo (mesma linguagem do quadro Kanban); soltar em cima de outra
// tarefa do MESMO grupo reordena (troca adjacente, igual ao checklist).
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
    </div>
  );
}
