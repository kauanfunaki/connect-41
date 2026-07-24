import Link from "next/link";
import { MessageCircle, Building2, User, HelpCircle } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { scopedChatwootConversationWhere } from "@/lib/auth/scope";
import { isChatwootConfigured } from "@/lib/chatwoot/connection";
import { channelLabel, statusLabel } from "@/lib/chatwoot/labels";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AtendimentosAccordion } from "@/components/conversas/AtendimentosAccordion";
import { VincularContato } from "@/components/conversas/VincularContato";

const PER_PAGE = 15; // contatos por página (cada um pode ter N atendimentos)

// Mesma semântica de cor do badge de status em AtendimentosAccordion.tsx —
// aqui só a cor do "pontinho", já que o botão inteiro já fica destacado quando ativo.
const STATUS_TABS = [
  { value: "open", label: "Abertas", dot: "bg-success" },
  { value: "pending", label: "Pendentes", dot: "bg-warning" },
  { value: "resolved", label: "Resolvidas", dot: "bg-fg-muted" },
  { value: "snoozed", label: "Adiadas", dot: "bg-brand" },
];

// Visão de auditoria: agrupada por contato, com os atendimentos (janelas de
// 24h do Chatwoot) colapsados por data — pensada pra busca de atendimentos
// antigos, não pra operação de chat em tempo real (isso continua no Chatwoot).
export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; canal?: string; atendente?: string; de?: string; ate?: string; page?: string; id?: string }>;
}) {
  const { search, status, canal, atendente, de, ate, page, id } = await searchParams;
  const ctx = await getAuthContext();
  const prisma = getPrisma();

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
      <PageContainer>
        <EmptyState
          icon={<MessageCircle />}
          title="Não foi possível carregar as conversas"
          description="Tente novamente em alguns instantes. Se persistir, confirme com o administrador se a última atualização do Connect foi aplicada por completo."
        />
      </PageContainer>
    );
  }

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, canal, atendente, de, ate, page, ...params };
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
    <PageContainer>
      <div className="mb-5">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Conversas</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Auditoria de atendimentos do Chatwoot — {totalContacts} contato{totalContacts !== 1 ? "s" : ""},{" "}
          {totalAtendimentos} atendimento{totalAtendimentos !== 1 ? "s" : ""} nesta página. Somente leitura.
        </p>
      </div>

      {/* Filtros: busca + período + status + canal */}
      <form method="GET" action="/conversas" className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[220px] max-w-xs">
          <label htmlFor="search" className="block text-[11.5px] text-fg-muted mb-1">Busca</label>
          <Input id="search" name="search" defaultValue={search ?? ""} placeholder="Contato, empresa ou mensagem…" />
        </div>
        <div>
          <label htmlFor="de" className="block text-[11.5px] text-fg-muted mb-1">De</label>
          <Input id="de" name="de" type="date" defaultValue={de ?? ""} className="w-36" />
        </div>
        <div>
          <label htmlFor="ate" className="block text-[11.5px] text-fg-muted mb-1">Até</label>
          <Input id="ate" name="ate" type="date" defaultValue={ate ?? ""} className="w-36" />
        </div>
        {assignees.length > 0 && (
          <div>
            <label htmlFor="atendente" className="block text-[11.5px] text-fg-muted mb-1">Atendente</label>
            <Select id="atendente" name="atendente" defaultValue={atendente ?? ""} className="w-44">
              <option value="">Todos</option>
              {assignees.map((a) => (
                <option key={a.assigneeLabel} value={a.assigneeLabel!}>{a.assigneeLabel}</option>
              ))}
            </Select>
          </div>
        )}
        {status && <input type="hidden" name="status" value={status} />}
        {canal && <input type="hidden" name="canal" value={canal} />}
        <button
          type="submit"
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          Filtrar
        </button>
        {(search || de || ate || status || canal || atendente) && (
          <Link href="/conversas" className="h-9 px-3 rounded-md text-[12.5px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center">
            Limpar
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => {
            const isActive = tab.value === status;
            return (
              <Link
                key={tab.value}
                href={buildUrl({ status: isActive ? undefined : tab.value, page: "1" })}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                  isActive ? "bg-surface-2 text-fg border border-border-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tab.dot}`} />
                {tab.label}
              </Link>
            );
          })}
        </div>
        {channelLabels.length > 1 && (
          <div className="flex items-center gap-1 border-l border-border pl-2">
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
      </div>

      {links.length === 0 && orphanConversations.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
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
              <div key={link.id} className="bg-surface border border-border rounded-2xl px-4 py-3">
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
            <div className="bg-surface border border-border rounded-2xl px-4 py-3">
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
    </PageContainer>
  );
}
