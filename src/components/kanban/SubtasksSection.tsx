"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ListTree, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

export type SubtaskData = {
  id: string;
  title: string;
  stageName: string;
  isTerminal: boolean;
  priority: number;
};

type Props = {
  canAct: boolean;
  canDelete: boolean;
  basePath: string;
  subtasks: SubtaskData[];
  createAction: (title: string) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
};

const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

export function SubtasksSection({ canAct, canDelete, basePath, subtasks, createAction, deleteAction }: Props) {
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(subtasks.length > 0);
  const [, startTransition] = useTransition();

  const done = subtasks.filter((s) => s.isTerminal).length;
  const pct = subtasks.length > 0 ? Math.round((done / subtasks.length) * 100) : 0;

  function addSubtask() {
    const t = title.trim();
    if (!t) return;
    startTransition(() => createAction(t));
    setTitle("");
  }

  if (subtasks.length === 0 && !open) {
    if (!canAct) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
      >
        <ListTree size={13} /> Adicionar subtarefa
      </button>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-fg">Subtarefas</h2>
        {subtasks.length > 0 ? (
          <span className="text-[11px] text-fg-muted tnum">{done}/{subtasks.length} concluídas · {pct}%</span>
        ) : (
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-fg-muted hover:text-fg p-0.5">
            <X size={14} />
          </button>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden mb-3">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="divide-y divide-border">
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-2 group">
            <Link
              href={`${basePath}/itens/${s.id}`}
              className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-fg hover:text-brand transition-colors"
            >
              <span
                className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                style={{ background: PRIORITY_COLOR[s.priority] ?? PRIORITY_COLOR[0] }}
              />
              <span className={`truncate ${s.isTerminal ? "line-through text-fg-muted" : ""}`}>{s.title}</span>
            </Link>
            <span className="text-[11px] text-fg-muted flex-shrink-0">{s.stageName}</span>
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remover a subtarefa "${s.title}"? Esta ação não pode ser desfeita.`)) {
                    startTransition(() => deleteAction(s.id));
                  }
                }}
                className="text-fg-muted hover:text-danger p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remover subtarefa"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {canAct && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
            placeholder="Adicionar subtarefa…"
          />
          <button
            type="button"
            onClick={addSubtask}
            className="h-9 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
          >
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
