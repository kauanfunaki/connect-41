"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/recruitmentFunnel";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export type FunnelCard = {
  id: string;
  personId: string;
  personName: string;
  origin: string | null;
  hasResume: boolean;
  stage: Stage;
  scorecardCount: number;
};

type ActionResult = { error: string } | null;

type Props = {
  vagaId: string;
  cards: FunnelCard[];
  canManage: boolean;
  moveAction: (candidaturaId: string, stage: Stage) => Promise<ActionResult>;
  encerrarAction: (
    candidaturaId: string,
    outcome: "REPROVADO" | "DESISTENTE",
    reason: string | null
  ) => Promise<ActionResult>;
};

type EncerrarTarget = { cardId: string; personName: string; outcome: "REPROVADO" | "DESISTENTE" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

export function RecruitmentFunnel({ vagaId, cards: initialCards, canManage, moveAction, encerrarAction }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encerrarTarget, setEncerrarTarget] = useState<EncerrarTarget | null>(null);
  const [motivo, setMotivo] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Aplica otimista e DESFAZ se a action retornar erro — antes o card mudava de
  // coluna (ou sumia) mesmo quando o servidor recusava, e a tela só voltava ao
  // estado real num refresh manual.
  function moveCard(cardId: string, stage: Stage) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === stage) return;
    const previous = card.stage;
    setError(null);
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage } : c)));
    startTransition(async () => {
      const result = await moveAction(cardId, stage);
      if (result?.error) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage: previous } : c)));
        setError(result.error);
      }
    });
  }

  function confirmEncerrar() {
    if (!encerrarTarget) return;
    const { cardId, outcome } = encerrarTarget;
    const removed = cards.find((c) => c.id === cardId);
    setDialogError(null);
    startTransition(async () => {
      const result = await encerrarAction(cardId, outcome, motivo.trim() || null);
      if (result?.error) {
        setDialogError(result.error);
        return;
      }
      if (removed) setCards((prev) => prev.filter((c) => c.id !== cardId));
      setEncerrarTarget(null);
      setMotivo("");
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <div className="scroll-x overflow-x-auto flex gap-3 pb-1">
        {ACTIVE_STAGES.map((stage) => {
          const stageCards = cards.filter((c) => c.stage === stage);
          const isContratado = stage === "CONTRATADO";
          const isDragOver = dragOver === stage;

          return (
            <section
              key={stage}
              aria-label={`Etapa ${STAGE_LABEL[stage]}, ${stageCards.length} candidato(s)`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setDragOver(null);
                setDraggingId(null);
                if (id) moveCard(id, stage);
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
                  <article
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
                      <Link
                        href={`/candidatos/${c.personId}`}
                        className="text-[13px] text-fg hover:text-brand transition-colors truncate"
                      >
                        {c.personName}
                      </Link>
                    </div>

                    {c.origin && <p className="text-[11px] text-fg-muted mt-1.5 pl-8">via {c.origin}</p>}

                    {/* Alternativa acessível ao arraste: o board era só
                        drag-and-drop de mouse, então quem usa teclado ou leitor
                        de tela não conseguia executar a ação principal da tela
                        (e no celular arrastar entre colunas é impraticável). */}
                    {canManage && !isContratado && (
                      <div className="mt-2">
                        <label htmlFor={`stage-${c.id}`} className="sr-only">
                          Etapa de {c.personName}
                        </label>
                        <Select
                          id={`stage-${c.id}`}
                          compact
                          value={c.stage}
                          disabled={pending}
                          onChange={(e) => moveCard(c.id, e.target.value as Stage)}
                        >
                          {ACTIVE_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

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
                            onClick={() => {
                              setMotivo("");
                              setDialogError(null);
                              setEncerrarTarget({ cardId: c.id, personName: c.personName, outcome: "REPROVADO" });
                            }}
                            className="inline-flex items-center h-8 px-2 rounded-md text-[12px] text-danger hover:bg-danger/8 transition-colors"
                          >
                            Reprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMotivo("");
                              setDialogError(null);
                              setEncerrarTarget({ cardId: c.id, personName: c.personName, outcome: "DESISTENTE" });
                            }}
                            className="inline-flex items-center h-8 px-2 rounded-md text-[12px] text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
                          >
                            Desistiu
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {stageCards.length === 0 && <p className="text-[11px] text-fg-muted text-center py-3">—</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* Substitui o window.prompt: sem tema, sem validação, sem mostrar erro de
          retorno, e bloqueado por alguns navegadores. */}
      <ConfirmDialog
        open={encerrarTarget !== null}
        title={
          encerrarTarget?.outcome === "REPROVADO"
            ? `Reprovar ${encerrarTarget?.personName}?`
            : `Registrar desistência de ${encerrarTarget?.personName}?`
        }
        description="O candidato sai do board e vai para a faixa de encerrados. A etapa alcançada é preservada para o cálculo de conversão."
        confirmLabel={encerrarTarget?.outcome === "REPROVADO" ? "Reprovar" : "Registrar desistência"}
        destructive={encerrarTarget?.outcome === "REPROVADO"}
        pending={pending}
        error={dialogError}
        onConfirm={confirmEncerrar}
        onCancel={() => {
          setEncerrarTarget(null);
          setMotivo("");
          setDialogError(null);
        }}
      >
        <label htmlFor="encerrar-motivo" className="block text-[length:var(--fs-label)] font-medium text-fg mb-1.5">
          Motivo <span className="text-fg-muted font-normal">(opcional)</span>
        </label>
        <Textarea
          id="encerrar-motivo"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          placeholder="Ex: perfil técnico abaixo do exigido; aceitou outra proposta…"
        />
      </ConfirmDialog>
    </>
  );
}
