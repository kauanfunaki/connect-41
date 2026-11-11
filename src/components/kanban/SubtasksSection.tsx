"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { oQueVaiJunto } from "@/components/kanban/RowActionsMenu";
import { useConcluirComSubatividades } from "@/components/kanban/useConcluirComSubatividades";
import { AVISO_DO_LIMITE } from "@/lib/kanban/subatividades";
import { segmentoDaTarefa } from "@/lib/enderecoCurto";

export type SubtaskData = {
  id: string;
  /** O número da tarefa: o link vai pelo endereço curto, tarefa-77 (10/11/2026). */
  number?: number;
  title: string;
  stageName: string;
  stageColor: string | null;
  isTerminal: boolean;
  stageType?: StageDotType;
  /** As filhas diretas dela — o "0/1" do nível de baixo (06/11/2026). */
  filhasConcluidas: number;
  filhasTotal: number;
  /** Todas abaixo dela, de todos os níveis: o "vai junto" de excluir. */
  abaixo: number;
  /** As abertas abaixo dela: a pergunta de concluir. */
  abertasAbaixo: number;
};

type Props = {
  canAct: boolean;
  canDelete: boolean;
  basePath: string;
  pipelineId: string;
  subtasks: SubtaskData[];
  /** A atividade aberta já está no último nível: sem campo, com o porquê. */
  noLimite?: boolean;
  createAction: (title: string) => Promise<{ error: string } | void>;
  deleteAction: (id: string) => Promise<void>;
  concluirAction: (pipelineId: string, itemId: string, comSubatividades?: boolean) => Promise<{ error: string } | void>;
  reabrirAction: (pipelineId: string, itemId: string) => Promise<{ error: string } | void>;
};

const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

// O cartão e o cabeçalho ficam por conta do DetailSection que envolve esta
// seção no detalhamento — aqui sobrou só o conteúdo.
//
// Em qualquer nível desde 06/11/2026: a subatividade aberta mostra a mesma
// seção para as filhas dela, e cada filha traz o "0/1" das próprias filhas —
// abrir a filha é o caminho para descer mais um nível.
export function SubtasksSection({ canAct, canDelete, basePath, pipelineId, subtasks, noLimite = false, createAction, deleteAction, concluirAction, reabrirAction }: Props) {
  const [title, setTitle] = useState("");
  const [pendente, startCriar] = useTransition();
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();
  const { dialog: perguntaDeConcluir, concluir } = useConcluirComSubatividades();
  const toast = useToast();

  const done = subtasks.filter((s) => s.isTerminal).length;
  const pct = subtasks.length > 0 ? Math.round((done / subtasks.length) * 100) : 0;

  function addSubtask() {
    const t = title.trim();
    if (!t || pendente) return;
    startCriar(async () => {
      try {
        const r = await createAction(t);
        if (r && "error" in r) toast.error(r.error);
        else setTitle("");
      } catch {
        toast.error("Não deu para falar com o servidor. A subatividade não foi criada.");
      }
    });
  }

  return (
    <div>
      {subtasks.length === 0 && !noLimite && (
        <p className="text-fs-2 text-fg-muted italic mb-2">Nenhuma subatividade ainda.</p>
      )}

      {subtasks.length > 0 && (
        <div
          className="h-1.5 rounded-full bg-surface-hover overflow-hidden mb-3"
          role="progressbar"
          aria-label="Subatividades concluídas"
          aria-valuemin={0}
          aria-valuemax={subtasks.length}
          aria-valuenow={done}
          aria-valuetext={`${done} de ${subtasks.length}`}
        >
          <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="divide-y divide-border">
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-2 group">
            <button
              type="button"
              disabled={!canAct}
              onClick={() => {
                if (s.isTerminal) {
                  startTransition(async () => {
                    const r = await reabrirAction(pipelineId, s.id);
                    if (r && "error" in r) toast.error(r.error);
                  });
                } else concluir({ nome: s.title, abertas: s.abertasAbaixo, concluir: (junto) => concluirAction(pipelineId, s.id, junto) });
              }}
              aria-label={s.isTerminal ? "Reabrir subatividade" : "Concluir subatividade"}
              className="group/dot flex-shrink-0 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
            >
              <StageDot
                color={s.stageColor ?? PRIORITY_COLOR[0]}
                type={s.stageType ?? (s.isTerminal ? "DONE" : "NOT_STARTED")}
                showCheckOnHover
              />
            </button>
            <Link
              href={`${basePath}/itens/${segmentoDaTarefa(s)}`}
              className="flex-1 min-w-0 flex items-center gap-2 text-fs-3 text-fg hover:text-brand transition-colors"
            >
              <span className={`truncate ${s.isTerminal ? "text-fg-muted" : ""}`}>{s.title}</span>
              {s.filhasTotal > 0 && (
                <span className="text-fs-1 text-fg-muted flex-shrink-0 tnum">
                  <span aria-hidden>
                    {s.filhasConcluidas}/{s.filhasTotal}
                  </span>
                  <span className="sr-only">
                    , {s.filhasConcluidas} de {s.filhasTotal} {s.filhasTotal === 1 ? "subatividade concluída" : "subatividades concluídas"}
                  </span>
                </span>
              )}
            </Link>
            <span className="text-fs-1 text-fg-muted flex-shrink-0">{s.stageName}</span>
            {canDelete && (
              // O `IconButton`, como os do checklist (15/10/2026): era um
              // botão de ícone desenhado à mão.
              <IconButton
                size="sm"
                onClick={() =>
                  requestConfirm(
                    { title: `Remover a subatividade "${s.title}"?`, description: oQueVaiJunto(s.abaixo), destructive: true, confirmLabel: "Remover" },
                    () => deleteAction(s.id)
                  )
                }
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                aria-label={`Remover a subatividade ${s.title}`}
              >
                <Trash2 size={13} />
              </IconButton>
            )}
          </div>
        ))}
      </div>

      {canAct && noLimite && <p className="text-fs-2 text-fg-muted mt-3">{AVISO_DO_LIMITE}</p>}

      {canAct && !noLimite && (
        <div className="flex items-center gap-2 mt-3">
          <Input
            compact
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
            placeholder="Adicionar subatividade…"
            aria-label="Nome da subatividade nova"
            maxLength={200}
            readOnly={pendente}
          />
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={addSubtask}
            disabled={!title.trim() || pendente}
            className="flex-shrink-0"
          >
            {pendente ? "Adicionando…" : "Adicionar"}
          </Button>
        </div>
      )}
      {dialog}
      {perguntaDeConcluir}
    </div>
  );
}
