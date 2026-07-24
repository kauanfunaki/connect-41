"use client";

import { useState } from "react";
import { MessageCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { SlideOver } from "@/components/ui/SlideOver";
import { ScoreRing } from "@/components/avaliacaoAtendimentos/ScoreRing";
import { AgentUserSelector, type LinkableUser } from "@/components/avaliacaoAtendimentos/AgentUserSelector";

export type EvaluationEntry = {
  id: string;
  conversationLocalId: string;
  score: number;
  writingScore: number;
  slaScore: number;
  reasoning: string;
  evaluatedAtLabel: string;
};

type Props = {
  label: string;
  subLabel: string | null;
  avatarUrl: string | null;
  avgScore: number;
  avgWriting: number;
  avgSla: number;
  count: number;
  evaluations: EvaluationEntry[];
  agentLinkId: string | null;
  linkedUserId: string | null;
  users: LinkableUser[];
  canManageLinks: boolean;
  linkAction: (agentLinkId: string, userId: string | null) => Promise<void>;
};

// Card recolhido (grid) que abre um painel lateral com o anel de nota +
// sub-notas + lista de atendimentos — o anel só existe dentro do painel
// (por pedido do usuário: "só deve aparecer quando eu clicar no card").
export function AgentCard({
  label, subLabel, avatarUrl, avgScore, avgWriting, avgSla, count, evaluations,
  agentLinkId, linkedUserId, users, canManageLinks, linkAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EvaluationEntry | null>(null);

  function handleClose() {
    setOpen(false);
    setSelected(null);
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
            </div>

            {agentLinkId && (
              <div>
                <label className="block text-[11px] text-fg-muted mb-1">Vínculo com usuário</label>
                <AgentUserSelector agentLinkId={agentLinkId} linkedUserId={linkedUserId} users={users} canEdit={canManageLinks} action={linkAction} />
                {subLabel && <p className="text-[11px] text-fg-muted mt-1">Nome no Chatwoot: {subLabel}</p>}
              </div>
            )}

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
