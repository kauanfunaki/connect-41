"use client";

import { useState, useTransition } from "react";
import { MessageCircle, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { SlideOver } from "@/components/ui/SlideOver";
import { ScoreRing } from "@/components/avaliacaoAtendimentos/ScoreRing";
import { useToast } from "@/components/ui/Toast";

export type EvaluationEntry = {
  id: string;
  conversationLocalId: string;
  score: number;
  writingScore: number;
  slaScore: number;
  reasoning: string;
  evaluatedAtLabel: string;
};

export type AgentSummaryData = {
  text: string;
  generatedAtLabel: string;
  evaluationCount: number;
  examples: { conversationId: string; note: string }[];
};

type Props = {
  groupKey: string;
  label: string;
  linkedUserLabel: string | null;
  avatarUrl: string | null;
  avgScore: number;
  avgWriting: number;
  avgSla: number;
  count: number;
  evaluations: EvaluationEntry[];
  summary: AgentSummaryData | null;
  canGenerateSummary: boolean;
  generateSummaryAction: (groupKey: string, agentLabel: string) => Promise<{ error: string } | { ok: true }>;
};

// Card recolhido (grid) que abre um painel lateral com o anel de nota +
// sub-notas + resumo geral + lista de atendimentos — o anel só existe dentro
// do painel (por pedido do usuário: "só deve aparecer quando eu clicar no
// card"). Vínculo com usuário saiu daqui — vive em /admin/atendentes agora,
// pra não aparecer toda vez que alguém só quer ver a nota (ver Sessions).
export function AgentCard({
  groupKey, label, linkedUserLabel, avatarUrl, avgScore, avgWriting, avgSla, count, evaluations,
  summary, canGenerateSummary, generateSummaryAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EvaluationEntry | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleClose() {
    setOpen(false);
    setSelected(null);
  }

  function openExample(conversationId: string) {
    const ev = evaluations.find((e) => e.conversationLocalId === conversationId);
    if (ev) setSelected(ev);
  }

  function handleGenerateSummary() {
    startTransition(async () => {
      const res = await generateSummaryAction(groupKey, label);
      if ("error" in res) toast.error(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group text-left bg-surface border border-border rounded-2xl p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
      >
        <AvatarImage src={avatarUrl} name={label} size={44} bordered={false} className="mb-3" />
        <p className="text-[14px] font-semibold text-fg truncate">{label}</p>
        <p className="text-[12px] text-fg-muted truncate">
          {count} atendimento{count !== 1 ? "s" : ""} avaliado{count !== 1 ? "s" : ""}
        </p>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          Ver avaliação <ChevronRight size={13} />
        </span>
      </button>

      <SlideOver
        open={open}
        onClose={handleClose}
        onBack={selected ? () => setSelected(null) : undefined}
        title={selected ? undefined : label}
      >
        {selected ? (
          <div className="space-y-4">
            <div>
              <p className="text-[13px] text-fg-muted">{selected.evaluatedAtLabel}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-[26px] font-semibold text-fg tabular-nums">{selected.score}<span className="text-[14px] text-fg-muted">/100</span></span>
                <span className="text-[12.5px] text-fg-muted">Escrita {selected.writingScore}/50 · SLA {selected.slaScore}/50</span>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-fg-muted uppercase tracking-wide mb-1.5">Justificativa da IA</h3>
              <p className="text-[13.5px] text-fg leading-relaxed whitespace-pre-wrap">{selected.reasoning}</p>
            </div>
            <Link
              href={`/conversas?id=${selected.conversationLocalId}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
            >
              <MessageCircle size={14} /> Abrir conversa em Conversas
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col items-center py-2">
              <ScoreRing score={avgScore} size={128} />
              <div className="flex items-center gap-5 mt-3">
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-fg tabular-nums">{avgWriting.toFixed(0)}<span className="text-[11px] text-fg-muted">/50</span></p>
                  <p className="text-[10.5px] text-fg-muted">Escrita</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-fg tabular-nums">{avgSla.toFixed(0)}<span className="text-[11px] text-fg-muted">/50</span></p>
                  <p className="text-[10.5px] text-fg-muted">SLA</p>
                </div>
              </div>
              {linkedUserLabel && <p className="text-[11px] text-fg-muted mt-2">Vinculado a {linkedUserLabel}</p>}
            </div>

            <div className="bg-surface-hover rounded-lg p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[12px] font-semibold text-fg-muted uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles size={12} className="text-brand" /> Resumo geral
                </h3>
                {canGenerateSummary && (
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={isPending}
                    className="text-[11.5px] font-medium text-brand hover:underline disabled:opacity-60 flex-shrink-0"
                  >
                    {isPending ? "Gerando…" : summary ? "Atualizar" : "Gerar resumo"}
                  </button>
                )}
              </div>
              {summary ? (
                <>
                  <p className="text-[13px] text-fg leading-relaxed">{summary.text}</p>
                  <p className="text-[11px] text-fg-muted mt-2">
                    Gerado em {summary.generatedAtLabel} · baseado em {summary.evaluationCount} atendimento{summary.evaluationCount !== 1 ? "s" : ""}
                  </p>
                  {summary.examples.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {summary.examples.map((ex, i) => (
                        <button
                          key={ex.conversationId}
                          type="button"
                          onClick={() => openExample(ex.conversationId)}
                          title={ex.note}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border text-[11px] text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface transition-colors"
                        >
                          Exemplo {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[12.5px] text-fg-muted">
                  {canGenerateSummary
                    ? "Ainda não gerado — clique em \"Gerar resumo\" pra consolidar os padrões recorrentes deste atendente."
                    : "Nenhum resumo gerado ainda."}
                </p>
              )}
            </div>

            <div>
              <h3 className="text-[12px] font-semibold text-fg-muted uppercase tracking-wide mb-2">Atendimentos avaliados</h3>
              <div className="divide-y divide-border">
                {evaluations.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelected(ev)}
                    className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-surface-hover -mx-1 px-1 rounded-md transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-fg truncate">{ev.evaluatedAtLabel}</p>
                      <p className="text-[12px] text-fg-muted truncate max-w-[260px]">{ev.reasoning}</p>
                    </div>
                    <span className="flex-shrink-0 text-[13px] font-medium text-fg tabular-nums">{ev.score}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
