"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/recruitmentFunnel";

export type FunnelCard = {
  id: string;
  personId: string;
  personName: string;
  origin: string | null;
  hasResume: boolean;
  stage: Stage;
  scorecardCount: number;
};

type Props = {
  vagaId: string;
  cards: FunnelCard[];
  canManage: boolean;
  moveAction: (candidaturaId: string, stage: Stage) => Promise<void>;
  encerrarAction: (candidaturaId: string, outcome: "REPROVADO" | "DESISTENTE", reason: string | null) => Promise<void>;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

export function RecruitmentFunnel({ vagaId, cards: initialCards, canManage, moveAction, encerrarAction }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(stage: Stage, cardId: string) {
    setDragOver(null);
    setDraggingId(null);
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === stage) return;
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage } : c)));
    startTransition(() => {
      moveAction(cardId, stage);
    });
  }

  function handleEncerrar(cardId: string, outcome: "REPROVADO" | "DESISTENTE") {
    const label = outcome === "REPROVADO" ? "reprovação" : "desistência";
    const reason = window.prompt(`Motivo da ${label} (opcional):`);
    if (reason === null) return; // cancelado
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    startTransition(() => {
      encerrarAction(cardId, outcome, reason);
    });
  }

  return (
    <div className="scroll-x overflow-x-auto flex gap-3 pb-1">
      {ACTIVE_STAGES.map((stage) => {
        const stageCards = cards.filter((c) => c.stage === stage);
        const isContratado = stage === "CONTRATADO";
        const isDragOver = dragOver === stage;

        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage);
            }}
            onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) handleDrop(stage, id);
            }}
            className={`flex-shrink-0 w-64 rounded-lg border p-2.5 transition-colors ${
              isDragOver ? "border-brand bg-brand/5" : "border-border bg-surface-2"
            }`}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <span className={`text-[12px] font-semibold ${isContratado ? "text-success" : "text-fg"}`}>
                {STAGE_LABEL[stage]}
              </span>
              <span className="text-[11px] text-fg-muted tnum">{stageCards.length}</span>
            </div>

            <div className="space-y-2 min-h-[40px]">
              {stageCards.map((c) => (
                <div
                  key={c.id}
                  draggable={canManage && !isContratado}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    setDraggingId(c.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`bg-surface border border-border rounded-md p-2.5 ${
                    canManage && !isContratado ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === c.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand text-[10px] font-semibold flex items-center justify-center">
                      {initials(c.personName)}
                    </span>
                    <Link href={`/candidatos/${c.personId}`} className="text-[13px] text-fg hover:text-brand transition-colors truncate">
                      {c.personName}
                    </Link>
                  </div>
                  {c.origin && <p className="text-[11px] text-fg-muted mt-1.5 pl-8">via {c.origin}</p>}

                  {/* Ações eram links de 10px sem padding, encostados um no
                      outro — no toque, um erro de alvo reprovava o candidato.
                      Agora são alvos de 32px com separação e rótulo legível. */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <Link
                      href={`/vagas/${vagaId}/candidaturas/${c.id}`}
                      className="inline-flex items-center h-8 px-2 rounded-md text-[12px] font-medium text-brand hover:bg-brand/8 transition-colors"
                    >
                      Avaliar{c.scorecardCount > 0 ? ` (${c.scorecardCount})` : ""}
                    </Link>
                    {c.hasResume && (
                      <a
                        href={`/api/resumes/${c.id}`}
                        className="inline-flex items-center h-8 px-2 rounded-md text-[12px] text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
                      >
                        Currículo
                      </a>
                    )}
                    {canManage && !isContratado && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEncerrar(c.id, "REPROVADO")}
                          className="inline-flex items-center h-8 px-2 rounded-md text-[12px] text-danger hover:bg-danger/8 transition-colors"
                        >
                          Reprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEncerrar(c.id, "DESISTENTE")}
                          className="inline-flex items-center h-8 px-2 rounded-md text-[12px] text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
                        >
                          Desistiu
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {stageCards.length === 0 && (
                <p className="text-[11px] text-fg-muted text-center py-3">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
