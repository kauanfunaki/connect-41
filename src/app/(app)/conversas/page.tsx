import Link from "next/link";
import { MessageCircle, Building2, User, HelpCircle, Gauge, Settings } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { scopedChatwootConversationWhere } from "@/lib/auth/scope";
import { isChatwootConfigured } from "@/lib/chatwoot/connection";
import { agentGroupKey } from "@/lib/chatwoot/evaluation";
import { channelLabel, statusLabel } from "@/lib/chatwoot/labels";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AtendimentosAccordion } from "@/components/conversas/AtendimentosAccordion";
import { VincularContato } from "@/components/conversas/VincularContato";
import { ConversasFilterBar } from "@/components/conversas/ConversasFilterBar";
import { AgentCard } from "@/components/avaliacaoAtendimentos/AgentCard";
import { gerarResumoAgente } from "./actions";

const PER_PAGE = 15; // contatos por página (cada um pode ter N atendimentos)

type SearchParams = {
  search?: string; status?: string; canal?: string; atendente?: string;
  de?: string; ate?: string; page?: string; id?: string; view?: string;
};

// Visão de auditoria: agrupada por contato, com os atendimentos (janelas de
// 24h do Chatwoot) colapsados por data — pensada pra busca de atendimentos
// antigos, não pra operação de chat em tempo real (isso continua no Chatwoot).
// A Avaliação de Atendimentos (nota gerada por IA) vive aqui dentro como uma
// segunda visão (?view=avaliacao) em vez de item de menu próprio — as duas
// telas falam do mesmo dado (atendimentos do Chatwoot), só com lentes diferentes.
export default async function ConversasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await getAuthContext();

  const configured = await isChatwootConfigured(ctx.tenantId);
  if (!configured) {
    return (
      <PageContainer>
        <EmptyState
          icon={<MessageCircle />}
          title="Chatwoot não configurado"
          description={
            isFullAccess(ctx.role)
              ? "Configure a conexão em Admin → Integrações para ver o histórico de conversas aqui."
              : "Peça a um administrador para configurar a integração com o Chatwoot em Integrações."
          }
          action={
            isFullAccess(ctx.role) ? (
              <Link
                href="/admin/integracoes"
                className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors inline-flex items-center"
              >
                Ir para Integrações
              </Link>
            ) : undefined
          }
        />
      </PageContainer>
    );
  }

  const view = params.view === "avaliacao" ? "avaliacao" : "lista";

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Conversas</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {view === "avaliacao"
              ? "Nota de 0-100 (Escrita + SLA) por atendimento resolvido no Chatwoot — gerada automaticamente pela IA."
              : "Auditoria de atendimentos do Chatwoot. Somente leitura."}
          </p>
        </div>
        {view === "avaliacao" && isFullAccess(ctx.role) && (
          <Link
            href="/admin/atendentes"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            <Settings size={13} /> Gerenciar atendentes
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1 mb-5 border-b border-border">
        <Link
          href="/conversas"
          className={`inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            view === "lista" ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          <MessageCircle size={14} /> Atendimentos
        </Link>
        <Link
          href="/conversas?view=avaliacao"
          className={`inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            view === "avaliacao" ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          <Gauge size={14} /> Avaliação
        </Link>
      </div>

      {view === "avaliacao" ? <AvaliacaoView ctx={ctx} /> : <ListaAtendimentosView ctx={ctx} params={params} />}
    </PageContainer>
  );
}

type Ctx = Awaited<ReturnType<typeof getAuthContext>>;

async function ListaAtendimentosView({ ctx, params }: { ctx: Ctx; params: SearchParams }) {
  const { search, status, canal, atendente, de, ate, page, id } = params;
  const prisma = getPrisma();

  // "Abrir conversa em Conversas" (vindo da Avaliação) manda ?id=X — busca
  // dedicada e independente dos filtros/paginação da lista abaixo, porque o
  // atendimento em questão podia estar em outra página ou ser filtrado pelos
  // parâmetros atuais, fazendo o link cair de volta na lista genérica sem
  // nunca abrir a conversa pedida.
  const focusedConversation = id
    ? await prisma.chatwootConversation.findFirst({
        where: { id, ...scopedChatwootConversationWhere(ctx) },
        include: { contactLink: { include: { person: { select: { id: true, name: true } }, company: { select: { id: true, name: true } } } } },
      })
    : null;

  // Filtro de período sobre a data do atendimento (lastActivityAt). `ate` é
  // inclusivo — soma 1 dia e usa lt.
  const deDate = de ? new Date(`${de}T00:00:00`) : null;
  const ateDate = ate ? new Date(new Date(`${ate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000) : null;

  // Agrupado por LABEL (não pelo valor cru) — "Channel::Api" e "unknown" caem
  // os dois em "WhatsApp" (ver labels.ts), e sem agrupar apareciam dois
  // botões "WhatsApp" repetidos na barra de filtros.
  const rawChannels = await prisma.chatwootConversation.findMany({
    where: scopedChatwootConversationWhere(ctx),
    distinct: ["channel"],
    select: { channel: true },
    take: 20,
  });
  const channelGroups = new Map<string, string[]>();
  for (const { channel } of rawChannels) {
    const label = channelLabel(channel);
    channelGroups.set(label, [...(channelGroups.get(label) ?? []), channel]);
  }
  const channelLabels = [...channelGroups.keys()];

  const convWhere = {
    ...scopedChatwootConversationWhere(ctx),
    ...(status ? { status } : {}),
    ...(canal && channelGroups.has(canal) ? { channel: { in: channelGroups.get(canal)! } } : {}),
    ...(atendente ? { assigneeLabel: atendente } : {}),
    ...(deDate || ateDate
      ? { lastActivityAt: { ...(deDate ? { gte: deDate } : {}), ...(ateDate ? { lt: ateDate } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { lastMessagePreview: { contains: search } },
            { contactLink: { chatwootName: { contains: search } } },
            { contactLink: { chatwootEmail: { contains: search } } },
            { contactLink: { chatwootPhoneE164: { contains: search } } },
            { contactLink: { person: { name: { contains: search } } } },
            { contactLink: { company: { name: { contains: search } } } },
          ],
        }
      : {}),
  };

  const linkWhere = { tenantId: ctx.tenantId, conversations: { some: convWhere } };

  async function loadConversasData() {
    return Promise.all([
      prisma.chatwootContactLink.findMany({
        where: linkWhere,
        orderBy: { updatedAt: "desc" },
        skip: (Math.max(1, parseInt(page ?? "1")) - 1) * PER_PAGE,
        take: PER_PAGE,
        include: {
          person: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          conversations: { where: convWhere, orderBy: { lastActivityAt: "desc" } },
        },
      }),
      prisma.chatwootContactLink.count({ where: linkWhere }),
      // Conversas sem contato identificado no Chatwoot — agrupadas num card próprio.
      prisma.chatwootConversation.findMany({ where: { ...convWhere, contactLinkId: null }, orderBy: { lastActivityAt: "desc" }, take: 50 }),
      prisma.chatwootConversation.findMany({
        where: { ...scopedChatwootConversationWhere(ctx), assigneeLabel: { not: null } },
        distinct: ["assigneeLabel"],
        select: { assigneeLabel: true },
        orderBy: { assigneeLabel: "asc" },
        take: 50,
      }),
    ]);
  }

  // Defensivo: se a migration mais recente ainda não foi aplicada em produção
  // (coluna nova referenciada pelo schema, mas ausente no banco) ou o Chatwoot
  // estiver instável, essa consulta falha — melhor mostrar um estado de erro
  // específico desta página do que derrubar tudo no error boundary genérico.
  let links: Awaited<ReturnType<typeof loadConversasData>>[0] = [];
  let totalContacts = 0;
  let orphanConversations: Awaited<ReturnType<typeof loadConversasData>>[2] = [];
  let assignees: Awaited<ReturnType<typeof loadConversasData>>[3] = [];
  let loadError = false;

  try {
    [links, totalContacts, orphanConversations, assignees] = await loadConversasData();
  } catch (err) {
    console.error("[conversas:page] falha ao consultar atendimentos — migration pendente ou Chatwoot indisponível?", err);
    loadError = true;
  }

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const totalPages = Math.ceil(totalContacts / PER_PAGE);
  const canManageLinks = isFullAccess(ctx.role);

  if (loadError) {
    return (
      <EmptyState
        icon={<MessageCircle />}
        title="Não foi possível carregar as conversas"
        description="Tente novamente em alguns instantes. Se persistir, confirme com o administrador se a última atualização do Connect foi aplicada por completo."
      />
    );
  }

  function buildUrl(extra: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, canal, atendente, de, ate, page, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/conversas?${q.toString()}`;
  }

  const toResumo = (c: (typeof orphanConversations)[number]) => ({
    id: c.id,
    dateLabel: c.lastActivityAt ? formatInstantDate(c.lastActivityAt) : "Sem data",
    channelLabel: channelLabel(c.channel),
    statusLabel: statusLabel(c.status),
    status: c.status,
    assigneeLabel: c.assigneeLabel,
    messageCount: c.messageCount,
  });

  const totalAtendimentos = links.reduce((sum, l) => sum + l.conversations.length, 0) + orphanConversations.length;

  return (
    <>
      {id && (
        <div className="bg-surface border border-brand/30 rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[12px] font-medium text-brand">Atendimento aberto</p>
            <Link href="/conversas" className="text-[11.5px] text-fg-muted hover:text-fg transition-colors">
              ← Voltar à lista
            </Link>
          </div>
          {focusedConversation ? (
            <AtendimentosAccordion atendimentos={[toResumo(focusedConversation)]} defaultOpenId={id} />
          ) : (
            <p className="text-[13px] text-fg-muted py-2">Atendimento não encontrado ou fora do seu escopo.</p>
          )}
        </div>
      )}

      <p className="text-[12px] text-fg-muted -mt-3 mb-3">
        {totalContacts} contato{totalContacts !== 1 ? "s" : ""}, {totalAtendimentos} atendimento{totalAtendimentos !== 1 ? "s" : ""} nesta página.
      </p>

      {/* Filtros: busca + botão "Filtros" (período/atendente/status em popover, mesmo padrão da lista de tarefas por setor) + canal */}
      <ConversasFilterBar
        search={search ?? ""}
        status={status ?? ""}
        atendente={atendente ?? ""}
        de={de ?? ""}
        ate={ate ?? ""}
        assignees={assignees.map((a) => a.assigneeLabel!)}
      />

      {channelLabels.length > 1 && (
        <div className="flex items-center gap-1 mb-4">
          {channelLabels.map((label) => (
            <Link
              key={label}
              href={buildUrl({ canal: label === canal ? undefined : label, page: "1" })}
              className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                label === canal ? "bg-surface-2 text-fg border border-border-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {links.length === 0 && orphanConversations.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<MessageCircle />}
            title="Nenhum atendimento encontrado"
            description="Tente ajustar a busca ou os filtros, ou aguarde a próxima sincronização."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const displayName =
              link.person?.name ?? link.company?.name ?? link.chatwootName ?? link.chatwootEmail ?? link.chatwootPhoneE164 ?? "Contato sem identificação";
            const linkedLabel = link.person?.name ?? link.company?.name ?? null;
            const linkedHref = link.person ? `/pessoas/${link.person.id}` : link.company ? `/empresas/${link.company.id}` : null;
            return (
              <div key={link.id} className="bg-surface border border-border rounded-lg px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-brand-subtle text-brand flex items-center justify-center flex-shrink-0">
                      {link.company && !link.person ? <Building2 size={15} /> : <User size={15} />}
                    </span>
                    <div className="min-w-0">
                      {linkedHref ? (
                        <Link href={linkedHref} className="text-[13.5px] font-medium text-fg hover:text-brand transition-colors truncate block">
                          {displayName}
                        </Link>
                      ) : (
                        <p className="text-[13.5px] font-medium text-fg truncate">{displayName}</p>
                      )}
                      <p className="text-[11.5px] text-fg-muted truncate">
                        {[link.chatwootEmail, link.chatwootPhoneE164].filter(Boolean).join(" · ") || "Sem e-mail/telefone no Chatwoot"}
                        {" · "}
                        {link.conversations.length} atendimento{link.conversations.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <VincularContato contactLinkId={link.id} linkedLabel={linkedLabel} canManage={canManageLinks} />
                </div>
                <AtendimentosAccordion atendimentos={link.conversations.map(toResumo)} defaultOpenId={id} />
              </div>
            );
          })}

          {orphanConversations.length > 0 && (
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-8 h-8 rounded-full bg-surface-hover text-fg-muted flex items-center justify-center flex-shrink-0">
                  <HelpCircle size={15} />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium text-fg">Sem contato identificado</p>
                  <p className="text-[11.5px] text-fg-muted">
                    {orphanConversations.length} atendimento{orphanConversations.length !== 1 ? "s" : ""} sem contato no Chatwoot
                  </p>
                </div>
              </div>
              <AtendimentosAccordion atendimentos={orphanConversations.map(toResumo)} defaultOpenId={id} />
            </div>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-fg-muted">
            Página {pageNum} de {totalPages}
          </span>
          <div className="flex gap-1">
            {pageNum > 1 && (
              <Link
                href={buildUrl({ page: String(pageNum - 1) })}
                className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
              >
                ← Anterior
              </Link>
            )}
            {pageNum < totalPages && (
              <Link
                href={buildUrl({ page: String(pageNum + 1) })}
                className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Painel agregado de Avaliação de Atendimentos (nota 0-100 = Escrita 0-50 +
// SLA 0-50, ver src/lib/chatwoot/evaluation.ts) — mesma RBAC da lista: qualquer
// usuário do tenant visualiza, só isFullAccess gera resumo/gerencia vínculo.
// Migrado de /avaliacao-atendimentos pra dentro de /conversas (mesma base de
// dados, visões diferentes — não fazia sentido como item de menu à parte).
async function AvaliacaoView({ ctx }: { ctx: Ctx }) {
  const prisma = getPrisma();
  const canManage = isFullAccess(ctx.role);

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

  let evaluations: Awaited<ReturnType<typeof loadData>>[0] = [];
  let agentLinks: Awaited<ReturnType<typeof loadData>>[1] = [];
  let summaries: Awaited<ReturnType<typeof loadData>>[2] = [];
  let loadError = false;
  try {
    [evaluations, agentLinks, summaries] = await loadData();
  } catch (err) {
    console.error("[conversas:avaliacao] falha ao consultar avaliações — migration pendente?", err);
    loadError = true;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={<Gauge />}
        title="Não foi possível carregar as avaliações"
        description="Tente novamente em alguns instantes. Se persistir, confirme com o administrador se a última atualização do Connect foi aplicada por completo."
      />
    );
  }

  const agentLinkByAgentId = new Map(agentLinks.map((l) => [l.chatwootAgentId, l]));
  const summaryByGroupKey = new Map(summaries.map((s) => [s.groupKey, s]));

  type AgentGroup = {
    key: string;
    label: string;
    // Um mesmo atendente pode ter mais de um chatwootAgentId ao longo do
    // tempo (re-sincronização no Chatwoot) — guarda todos os vistos neste
    // grupo pra conseguir achar o vínculo de conta em qualquer um deles.
    assigneeIds: Set<number>;
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
    const key = agentGroupKey(assigneeId, assigneeLabel);
    const existing = groups.get(key);
    if (existing) {
      existing.scoreSum += ev.score;
      existing.writingSum += ev.writingScore;
      existing.slaSum += ev.slaScore;
      existing.count += 1;
      existing.evaluations.push(ev);
      if (assigneeId != null) existing.assigneeIds.add(assigneeId);
    } else {
      groups.set(key, {
        key,
        label: assigneeLabel ?? "Sem atendente",
        assigneeIds: new Set(assigneeId != null ? [assigneeId] : []),
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

  if (agentGroups.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg">
        <EmptyState
          icon={<Gauge />}
          title="Nenhuma avaliação ainda"
          description="As avaliações são geradas automaticamente quando um atendimento é resolvido no Chatwoot. Aguarde a próxima rodada da rotina de avaliação."
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden mb-6">
        <StatTile label="Atendimentos avaliados" value={evaluations.length} />
        <StatTile label="Nota média" value={totalAvg != null ? Math.round(totalAvg) : "—"} />
        <StatTile label="Escrita média" value={totalWriting != null ? `${Math.round(totalWriting)}/50` : "—"} />
        <StatTile label="SLA médio" value={totalSla != null ? `${Math.round(totalSla)}/50` : "—"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agentGroups.map((group) => {
          const agentLink = [...group.assigneeIds].map((id) => agentLinkByAgentId.get(id)).find((l) => l != null);
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
