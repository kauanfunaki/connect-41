"use client";

import { useState, useTransition } from "react";
import { MessageCircle, ChevronRight, Sparkles, EyeOff } from "lucide-react";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { SlideOver } from "@/components/ui/SlideOver";
import { ScoreRing } from "@/components/avaliacaoAtendimentos/ScoreRing";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
  /**
   * Tirar um atendimento da avaliação. `null` para quem não é SUPER_ADMIN — a
   * ação some da tela em vez de aparecer e falhar no clique.
   */
  excludeConversationAction:
    | ((conversationId: string, excluir: boolean) => Promise<{ error: string } | { ok: true }>)
    | null;
};

// Card recolhido (grid) que abre um painel lateral com o anel de nota +
// sub-notas + resumo geral + lista de atendimentos — o anel só existe dentro
// do painel (por pedido do usuário: "só deve aparecer quando eu clicar no
// card"). Vínculo com usuário saiu daqui — vive em /admin/atendentes agora,
// pra não aparecer toda vez que alguém só quer ver a nota (ver Sessions).
export function AgentCard({
  groupKey, label, linkedUserLabel, avatarUrl, avgScore, avgWriting, avgSla, count, evaluations,
  summary, canGenerateSummary, generateSummaryAction, excludeConversationAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EvaluationEntry | null>(null);
  const [isPending, startTransition] = useTransition();
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  // Pede confirmação antes (achado do polimento de 30/09): tirar da avaliação
  // muda a nota de alguém, e era um clique só.
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const toast = useToast();

  async function excluirAtendimento(conversationId: string) {
    if (!excludeConversationAction) return;
    setExcluindo(true);
    setErroExclusao(null);
    const res = await excludeConversationAction(conversationId, true);
    setExcluindo(false);
    setConfirmandoExclusao(false);
    if ("error" in res) {
      setErroExclusao(res.error);
      return;
    }
    // Fecha o detalhe: a nota que ele mostra acabou de deixar de existir, e
    // manter o painel aberto exibindo um número apagado seria mentira.
    setSelected(null);
    toast.show("Atendimento tirado da avaliação.");
  }

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
        className="group h-full w-full min-w-0 text-left bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
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
                <span className="text-[13px] text-fg-muted">Escrita {selected.writingScore}/50 · SLA {selected.slaScore}/50</span>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-fg-muted uppercase tracking-wide mb-1.5">Justificativa da IA</h3>
              <p className="text-[13px] text-fg leading-relaxed whitespace-pre-wrap">{selected.reasoning}</p>
            </div>
            {/* Eram dois links sublinhados (30/09): as duas são ações, e tirar
                da avaliação muda a nota de alguém — botão de perigo. */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Button href={`/conversas?id=${selected.conversationLocalId}`} variant="secondary" size="sm">
                <MessageCircle size={14} /> Abrir conversa em Conversas
              </Button>
              {excludeConversationAction && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={excluindo}
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  <EyeOff size={14} /> {excluindo ? "Tirando…" : "Tirar da avaliação"}
                </Button>
              )}
            </div>
            {erroExclusao && <p className="text-[13px] text-danger">{erroExclusao}</p>}
            <ConfirmDialog
              open={confirmandoExclusao}
              title="Tirar da avaliação?"
              description={`A nota deste atendimento é apagada e sai da média de ${label}.`}
              confirmLabel="Tirar da avaliação"
              destructive
              pending={excluindo}
              onConfirm={() => void excluirAtendimento(selected.conversationLocalId)}
              onCancel={() => setConfirmandoExclusao(false)}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col items-center py-2">
              <ScoreRing score={avgScore} size={128} />
              <div className="flex items-center gap-5 mt-3">
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-fg tabular-nums">{avgWriting.toFixed(0)}<span className="text-[11px] text-fg-muted">/50</span></p>
                  <p className="text-[length:var(--fs-micro)] text-fg-muted">Escrita</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-fg tabular-nums">{avgSla.toFixed(0)}<span className="text-[11px] text-fg-muted">/50</span></p>
                  <p className="text-[length:var(--fs-micro)] text-fg-muted">SLA</p>
                </div>
              </div>
              {linkedUserLabel && <p className="text-[11px] text-fg-muted mt-2">Vinculado a {linkedUserLabel}</p>}
            </div>

            <div className="bg-surface-hover rounded-lg p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[12px] font-semibold text-fg-muted uppercase tracking-wide inline-flex items-center gap-1.5">
                  <Sparkles size={14} className="text-brand" /> Resumo geral
                </h3>
                {canGenerateSummary && (
                  <Button variant="secondary" size="xs" className="flex-shrink-0" onClick={handleGenerateSummary} disabled={isPending}>
                    <Sparkles size={12} /> {isPending ? "Gerando…" : summary ? "Atualizar" : "Gerar resumo"}
                  </Button>
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
                          title={ex.note} aria-label={ex.note}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border text-[11px] text-fg-secondary hover:text-fg hover:border-border-strong hover:bg-surface transition-colors"
                        >
                          Exemplo {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-fg-muted">
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
                      <p className="text-[12px] text-fg-muted truncate">{ev.reasoning}</p>
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
