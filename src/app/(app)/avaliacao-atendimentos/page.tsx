import Link from "next/link";
import { Gauge, MessageCircle } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { isChatwootConfigured } from "@/lib/chatwoot/connection";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentUserSelector } from "@/components/avaliacaoAtendimentos/AgentUserSelector";
import { vincularAgenteChatwoot } from "./actions";

// Painel agregado de Avaliação de Atendimentos (nota 0-100 = Escrita 0-50 +
// SLA 0-50, ver src/lib/chatwoot/evaluation.ts) — mesma RBAC de /conversas:
// qualquer usuário do tenant visualiza, só isFullAccess gerencia o vínculo
// agente<->User. CSAT foi descartado nesta v1 (ver
// Backlog-Avaliacao-Atendimentos-2026-07-24.md no vault Obsidian).
export default async function AvaliacaoAtendimentosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canManageLinks = isFullAccess(ctx.role);

  const configured = await isChatwootConfigured(ctx.tenantId);
  if (!configured) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Gauge />}
          title="Chatwoot não configurado"
          description={
            canManageLinks
              ? "Configure a conexão em Admin → Integrações para começar a avaliar atendimentos aqui."
              : "Peça a um administrador para configurar a integração com o Chatwoot em Integrações."
          }
        />
      </PageContainer>
    );
  }

  async function loadData() {
    return Promise.all([
      prisma.conversationEvaluation.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { evaluatedAt: "desc" },
        take: 500,
        select: {
          id: true,
          score: true,
          writingScore: true,
          slaScore: true,
          reasoning: true,
          evaluatedAt: true,
          conversation: { select: { id: true, assigneeId: true, assigneeLabel: true } },
        },
      }),
      prisma.chatwootAgentLink.findMany({
        where: { tenantId: ctx.tenantId },
        include: { linkedUser: { select: { id: true, name: true, email: true } } },
      }),
      prisma.user.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    ]);
  }

  // Defensiva, mesmo espírito de /conversas: migration pendente em produção
  // não pode derrubar a página inteira.
  let evaluations: Awaited<ReturnType<typeof loadData>>[0] = [];
  let agentLinks: Awaited<ReturnType<typeof loadData>>[1] = [];
  let users: Awaited<ReturnType<typeof loadData>>[2] = [];
  let loadError = false;
  try {
    [evaluations, agentLinks, users] = await loadData();
  } catch (err) {
    console.error("[avaliacao-atendimentos:page] falha ao consultar avaliações — migration pendente?", err);
    loadError = true;
  }

  if (loadError) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Gauge />}
          title="Não foi possível carregar as avaliações"
          description="Tente novamente em alguns instantes. Se persistir, confirme com o administrador se a última atualização do Connect foi aplicada por completo."
        />
      </PageContainer>
    );
  }

  const agentLinkByAgentId = new Map(agentLinks.map((l) => [l.chatwootAgentId, l]));

  type AgentGroup = {
    key: string;
    label: string;
    assigneeId: number | null;
    assigneeLabel: string | null;
    scoreSum: number;
    writingSum: number;
    slaSum: number;
    count: number;
    recent: typeof evaluations;
  };

  const groups = new Map<string, AgentGroup>();
  for (const ev of evaluations) {
    const assigneeId = ev.conversation.assigneeId;
    const assigneeLabel = ev.conversation.assigneeLabel;
    const key = assigneeId != null ? `id:${assigneeId}` : assigneeLabel ? `label:${assigneeLabel}` : "sem-atendente";
    const existing = groups.get(key);
    if (existing) {
      existing.scoreSum += ev.score;
      existing.writingSum += ev.writingScore;
      existing.slaSum += ev.slaScore;
      existing.count += 1;
      if (existing.recent.length < 5) existing.recent.push(ev);
    } else {
      groups.set(key, {
        key,
        label: assigneeLabel ?? "Sem atendente",
        assigneeId,
        assigneeLabel,
        scoreSum: ev.score,
        writingSum: ev.writingScore,
        slaSum: ev.slaScore,
        count: 1,
        recent: [ev],
      });
    }
  }

  const agentGroups = [...groups.values()].sort((a, b) => b.scoreSum / b.count - a.scoreSum / a.count);
  const totalAvg = evaluations.length > 0 ? evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length : null;

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Avaliação de Atendimentos</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Nota de 0-100 (Escrita + SLA) por atendimento resolvido no Chatwoot — gerada automaticamente pela IA.
          {totalAvg != null && ` Média geral: ${totalAvg.toFixed(0)}.`}
        </p>
      </div>

      {agentGroups.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<Gauge />}
            title="Nenhuma avaliação ainda"
            description="As avaliações são geradas automaticamente quando um atendimento é resolvido no Chatwoot. Aguarde a próxima rodada da rotina de avaliação."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {agentGroups.map((group) => {
            const agentLink = group.assigneeId != null ? agentLinkByAgentId.get(group.assigneeId) : undefined;
            const avgScore = group.scoreSum / group.count;
            const avgWriting = group.writingSum / group.count;
            const avgSla = group.slaSum / group.count;
            const linkedLabel = agentLink?.linkedUser ? `${agentLink.linkedUser.name} (${agentLink.linkedUser.email})` : null;

            return (
              <div key={group.key} className="bg-surface border border-border rounded-2xl px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-fg truncate">
                      {agentLink?.linkedUser?.name ?? group.label}
                    </p>
                    <p className="text-[11.5px] text-fg-muted truncate">
                      {group.count} atendimento{group.count !== 1 ? "s" : ""} avaliado{group.count !== 1 ? "s" : ""}
                      {linkedLabel && !agentLink?.linkedUser?.name ? ` · ${linkedLabel}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <ScorePill label="Nota" value={avgScore} max={100} />
                    <ScorePill label="Escrita" value={avgWriting} max={50} />
                    <ScorePill label="SLA" value={avgSla} max={50} />
                  </div>
                </div>

                {agentLink && (
                  <div className="mb-2 max-w-xs">
                    <label className="block text-[11px] text-fg-muted mb-1">Vínculo com usuário</label>
                    <AgentUserSelector
                      agentLinkId={agentLink.id}
                      linkedUserId={agentLink.linkedUserId}
                      users={users}
                      canEdit={canManageLinks}
                      action={vincularAgenteChatwoot}
                    />
                  </div>
                )}

                <div className="border-t border-border pt-2 mt-2 space-y-1.5">
                  {group.recent.map((ev) => (
                    <div key={ev.id} className="flex items-start justify-between gap-3 text-[12px]">
                      <div className="min-w-0">
                        <Link
                          href={`/conversas?id=${ev.conversation.id}`}
                          className="text-fg hover:text-brand transition-colors inline-flex items-center gap-1"
                        >
                          <MessageCircle size={12} />
                          {formatInstantDate(ev.evaluatedAt)}
                        </Link>
                        <p className="text-fg-muted truncate max-w-md">{ev.reasoning}</p>
                      </div>
                      <span className="text-fg-muted flex-shrink-0 tabular-nums">{ev.score}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="text-center">
      <p className="text-[15px] font-semibold text-fg tabular-nums">{value.toFixed(0)}</p>
      <p className="text-[10.5px] text-fg-muted">{label} /{max}</p>
    </div>
  );
}
