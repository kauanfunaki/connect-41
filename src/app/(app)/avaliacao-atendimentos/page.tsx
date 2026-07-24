import Link from "next/link";
import { Gauge, Settings } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { isChatwootConfigured } from "@/lib/chatwoot/connection";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentCard } from "@/components/avaliacaoAtendimentos/AgentCard";
import { gerarResumoAgente } from "./actions";

// Painel agregado de Avaliação de Atendimentos (nota 0-100 = Escrita 0-50 +
// SLA 0-50, ver src/lib/chatwoot/evaluation.ts) — mesma RBAC de /conversas:
// qualquer usuário do tenant visualiza, só isFullAccess gera resumo/gerencia
// vínculo. CSAT foi descartado nesta v1 (ver
// Backlog-Avaliacao-Atendimentos-2026-07-24.md no vault Obsidian). Redesenho
// 2026-07-24: grid de cards por atendente (era lista), anel de nota +
// sub-notas revelados só ao clicar no card, resumo geral consolidado pela IA
// sob demanda, drill-down de conversa num painel lateral (era truncado
// inline), vínculo agente<->User movido pra /admin/atendentes (não aparece
// mais aqui toda vez que alguém só quer ver a nota).
export default async function AvaliacaoAtendimentosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canManage = isFullAccess(ctx.role);

  const configured = await isChatwootConfigured(ctx.tenantId);
  if (!configured) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Gauge />}
          title="Chatwoot não configurado"
          description={
            canManage
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
        include: { linkedUser: { select: { name: true, email: true, photoUrl: true } } },
      }),
      prisma.agentEvaluationSummary.findMany({ where: { tenantId: ctx.tenantId } }),
    ]);
  }

  // Defensiva, mesmo espírito de /conversas: migration pendente em produção
  // não pode derrubar a página inteira.
  let evaluations: Awaited<ReturnType<typeof loadData>>[0] = [];
  let agentLinks: Awaited<ReturnType<typeof loadData>>[1] = [];
  let summaries: Awaited<ReturnType<typeof loadData>>[2] = [];
  let loadError = false;
  try {
    [evaluations, agentLinks, summaries] = await loadData();
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
  const summaryByGroupKey = new Map(summaries.map((s) => [s.groupKey, s]));

  type AgentGroup = {
    key: string;
    label: string;
    assigneeId: number | null;
    assigneeLabel: string | null;
    scoreSum: number;
    writingSum: number;
    slaSum: number;
    count: number;
    evaluations: typeof evaluations;
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
      existing.evaluations.push(ev);
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
        evaluations: [ev],
      });
    }
  }

  const agentGroups = [...groups.values()].sort((a, b) => b.scoreSum / b.count - a.scoreSum / a.count);
  const totalAvg = evaluations.length > 0 ? evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length : null;
  const totalWriting = evaluations.length > 0 ? evaluations.reduce((s, e) => s + e.writingScore, 0) / evaluations.length : null;
  const totalSla = evaluations.length > 0 ? evaluations.reduce((s, e) => s + e.slaScore, 0) / evaluations.length : null;

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Avaliação de Atendimentos</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            Nota de 0-100 (Escrita + SLA) por atendimento resolvido no Chatwoot — gerada automaticamente pela IA.
          </p>
        </div>
        {canManage && (
          <Link
            href="/admin/atendentes"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            <Settings size={13} /> Gerenciar atendentes
          </Link>
        )}
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
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-xl overflow-hidden mb-6">
            <StatTile label="Atendimentos avaliados" value={evaluations.length} />
            <StatTile label="Nota média" value={totalAvg != null ? Math.round(totalAvg) : "—"} />
            <StatTile label="Escrita média" value={totalWriting != null ? `${Math.round(totalWriting)}/50` : "—"} />
            <StatTile label="SLA médio" value={totalSla != null ? `${Math.round(totalSla)}/50` : "—"} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentGroups.map((group) => {
              const agentLink = group.assigneeId != null ? agentLinkByAgentId.get(group.assigneeId) : undefined;
              const linkedUser = agentLink?.linkedUser ?? null;
              const summaryRow = summaryByGroupKey.get(group.key);

              return (
                <AgentCard
                  key={group.key}
                  groupKey={group.key}
                  label={linkedUser?.name ?? group.label}
                  linkedUserLabel={linkedUser ? `${linkedUser.name} (${linkedUser.email})` : null}
                  avatarUrl={linkedUser?.photoUrl ?? null}
                  avgScore={group.scoreSum / group.count}
                  avgWriting={group.writingSum / group.count}
                  avgSla={group.slaSum / group.count}
                  count={group.count}
                  evaluations={group.evaluations.map((ev) => ({
                    id: ev.id,
                    conversationLocalId: ev.conversation.id,
                    score: ev.score,
                    writingScore: ev.writingScore,
                    slaScore: ev.slaScore,
                    reasoning: ev.reasoning,
                    evaluatedAtLabel: formatInstantDate(ev.evaluatedAt),
                  }))}
                  summary={
                    summaryRow
                      ? {
                          text: summaryRow.summary,
                          generatedAtLabel: formatInstantDate(summaryRow.generatedAt),
                          evaluationCount: summaryRow.evaluationCount,
                          examples: summaryRow.exampleConversationIds as { conversationId: string; note: string }[],
                        }
                      : null
                  }
                  canGenerateSummary={canManage}
                  generateSummaryAction={gerarResumoAgente}
                />
              );
            })}
          </div>
        </>
      )}
    </PageContainer>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[20px] font-semibold text-fg tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-fg-muted mt-1.5">{label}</p>
    </div>
  );
}
