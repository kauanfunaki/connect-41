"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";
import { useConfirm } from "@/components/ui/useConfirm";

export type SubtaskData = {
  id: string;
  title: string;
  stageName: string;
  stageColor: string | null;
  isTerminal: boolean;
  stageType?: StageDotType;
  priority: number;
};

type Props = {
  canAct: boolean;
  canDelete: boolean;
  basePath: string;
  pipelineId: string;
  subtasks: SubtaskData[];
  createAction: (title: string) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  concluirAction: (pipelineId: string, itemId: string) => Promise<void>;
  reabrirAction: (pipelineId: string, itemId: string) => Promise<void>;
};

const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

// O cartão e o cabeçalho ficam por conta do DetailSection que envolve esta
// seção no detalhamento — aqui sobrou só o conteúdo.
export function SubtasksSection({ canAct, canDelete, basePath, pipelineId, subtasks, createAction, deleteAction, concluirAction, reabrirAction }: Props) {
  const [title, setTitle] = useState("");
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  const done = subtasks.filter((s) => s.isTerminal).length;
  const pct = subtasks.length > 0 ? Math.round((done / subtasks.length) * 100) : 0;

  function addSubtask() {
    const t = title.trim();
    if (!t) return;
    startTransition(() => createAction(t));
    setTitle("");
  }

  return (
    <div>
      {subtasks.length === 0 && (
        <p className="text-[12px] text-fg-muted italic mb-2">Nenhuma subtarefa ainda.</p>
      )}

      {subtasks.length > 0 && (
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden mb-3">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="divide-y divide-border">
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-2 group">
            <button
              type="button"
              disabled={!canAct}
              onClick={() =>
                startTransition(() =>
                  s.isTerminal ? reabrirAction(pipelineId, s.id) : concluirAction(pipelineId, s.id)
                )
              }
              aria-label={s.isTerminal ? "Reabrir subtarefa" : "Concluir subtarefa"}
              className="group/dot flex-shrink-0 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
            >
              <StageDot
                color={s.stageColor ?? PRIORITY_COLOR[0]}
                type={s.stageType ?? (s.isTerminal ? "DONE" : "NOT_STARTED")}
                showCheckOnHover
              />
            </button>
            <Link
              href={`${basePath}/itens/${s.id}`}
              className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-fg hover:text-brand transition-colors"
            >
              <span className={`truncate ${s.isTerminal ? "text-fg-muted" : ""}`}>{s.title}</span>
            </Link>
            <span className="text-[11px] text-fg-muted flex-shrink-0">{s.stageName}</span>
            {canDelete && (
              <button
                type="button"
                onClick={() =>
                  requestConfirm(
                    { title: `Remover a subtarefa "${s.title}"?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Remover" },
                    () => deleteAction(s.id)
                  )
                }
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
        <div className="flex items-center gap-2 mt-3">
          <Input
            compact
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
            placeholder="Adicionar subtarefa…"
          />
          <button
            type="button"
            onClick={addSubtask}
            className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
          >
            Adicionar
          </button>
        </div>
      )}
      {dialog}
    </div>
  );
}
