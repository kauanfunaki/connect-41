import Link from "next/link";
import { MessageCircle, Building2, User } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { scopedChatwootConversationWhere } from "@/lib/auth/scope";
import { isChatwootConfigured } from "@/lib/chatwoot/connection";
import { ensureMessagesLoaded } from "@/lib/chatwoot/conversations";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { MessageThread } from "@/components/conversas/MessageThread";

const PER_PAGE = 25;

const STATUS_TABS = [
  { value: "open", label: "Abertas" },
  { value: "pending", label: "Pendentes" },
  { value: "resolved", label: "Resolvidas" },
  { value: "snoozed", label: "Adiadas" },
];

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; canal?: string; page?: string; id?: string }>;
}) {
  const { search, status, canal, page, id } = await searchParams;
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
              <Link href="/admin/integracoes" className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors inline-flex items-center">
                Ir para Integrações
              </Link>
            ) : undefined
          }
        />
      </PageContainer>
    );
  }

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const where = {
    ...scopedChatwootConversationWhere(ctx),
    ...(status ? { status } : {}),
    ...(canal ? { channel: canal } : {}),
    ...(search
      ? {
          OR: [
            { lastMessagePreview: { contains: search } },
            { contactLink: { chatwootEmail: { contains: search } } },
            { contactLink: { person: { name: { contains: search } } } },
            { contactLink: { company: { name: { contains: search } } } },
          ],
        }
      : {}),
  };

  const [conversations, total, channels] = await Promise.all([
    prisma.chatwootConversation.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { contactLink: { include: { person: { select: { id: true, name: true } }, company: { select: { id: true, name: true } } } } },
    }),
    prisma.chatwootConversation.count({ where }),
    prisma.chatwootConversation.findMany({
      where: scopedChatwootConversationWhere(ctx),
      distinct: ["channel"],
      select: { channel: true },
      take: 20,
    }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, canal, page, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/conversas?${q.toString()}`;
  }

  const selectedId = id ?? conversations[0]?.id;
  const selected = selectedId ? await prisma.chatwootConversation.findFirst({ where: { id: selectedId, tenantId: ctx.tenantId } }) : null;

  let messages: Awaited<ReturnType<typeof prisma.chatwootMessage.findMany>> = [];
  if (selected) {
    await ensureMessagesLoaded(ctx.tenantId, selected.id);
    messages = await prisma.chatwootMessage.findMany({
      where: { conversationId: selected.id },
      orderBy: { chatwootCreatedAt: "asc" },
    });
  }

  const canViewPrivate = isFullAccess(ctx.role);

  return (
    <PageContainer>
      <div className="mb-5">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Conversas</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {total} conversa{total !== 1 ? "s" : ""} — histórico do Chatwoot, somente leitura.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <form method="GET" action="/conversas" className="flex-1 max-w-xs">
          {status && <input type="hidden" name="status" value={status} />}
          {canal && <input type="hidden" name="canal" value={canal} />}
          <Input name="search" defaultValue={search ?? ""} placeholder="Buscar por contato, empresa ou mensagem…" />
        </form>

        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => {
            const isActive = tab.value === status;
            return (
              <Link
                key={tab.value}
                href={buildUrl({ status: isActive ? undefined : tab.value, page: "1" })}
                className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                  isActive ? "bg-surface-2 text-fg border border-border-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {channels.length > 0 && (
          <div className="flex items-center gap-1">
            {channels.map((c) => (
              <Link
                key={c.channel}
                href={buildUrl({ canal: c.channel === canal ? undefined : c.channel, page: "1" })}
                className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                  c.channel === canal ? "bg-surface-2 text-fg border border-border-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2"
                }`}
              >
                {c.channel}
              </Link>
            ))}
          </div>
        )}
      </div>

      {conversations.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<MessageCircle />}
            title="Nenhuma conversa encontrada"
            description="Tente ajustar a busca ou os filtros, ou aguarde a próxima sincronização."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="border-r border-border max-h-[70vh] overflow-y-auto">
            {conversations.map((c) => {
              const contactLabel = c.contactLink?.person?.name ?? c.contactLink?.company?.name ?? c.contactLink?.chatwootEmail ?? "Contato sem nome";
              const isActive = c.id === selectedId;
              return (
                <Link
                  key={c.id}
                  href={buildUrl({ id: c.id })}
                  className={`block px-4 py-3 border-b border-border last:border-b-0 transition-colors ${isActive ? "bg-surface-2" : "hover:bg-surface-hover"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-fg truncate">{contactLabel}</span>
                    {c.unreadCount > 0 && (
                      <span className="flex-shrink-0 text-[10px] font-semibold bg-brand text-on-brand rounded-full px-1.5 py-0.5">{c.unreadCount}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-fg-muted truncate mt-0.5">{c.lastMessagePreview ?? "Sem mensagens ainda"}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-fg-muted">
                    <span>{c.channel}</span>
                    <span>·</span>
                    <span>{c.status}</span>
                    {c.contactLink?.company && (
                      <>
                        <span>·</span>
                        <Building2 size={11} />
                      </>
                    )}
                    {c.contactLink?.person && !c.contactLink?.company && (
                      <>
                        <span>·</span>
                        <User size={11} />
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="p-4 max-h-[70vh] overflow-y-auto">
            {!selected ? (
              <EmptyState icon={<MessageCircle />} title="Selecione uma conversa" />
            ) : (
              <>
                <div className="mb-4 pb-3 border-b border-border">
                  <p className="text-[14px] font-medium text-fg">
                    {selected.assigneeLabel ? `Atendente: ${selected.assigneeLabel}` : "Sem atendente atribuído"}
                  </p>
                  <p className="text-[12px] text-fg-muted mt-0.5">
                    Canal: {selected.channel} · Status: {selected.status}
                    {selected.teamLabel ? ` · Equipe: ${selected.teamLabel}` : ""}
                  </p>
                </div>
                <MessageThread
                  conversationId={selected.id}
                  hasMore={messages.length > 0}
                  canViewPrivate={canViewPrivate}
                  messages={messages.map((m) => ({
                    id: m.id,
                    senderLabel: m.senderLabel,
                    messageType: m.messageType,
                    content: m.content,
                    isPrivate: m.isPrivate,
                    attachments: (m.attachments as { fileType: string; fileSize: number | null; url: string }[] | null) ?? [],
                    createdAtLabel: formatInstantDate(m.chatwootCreatedAt),
                  }))}
                />
              </>
            )}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-fg-muted">
            Página {pageNum} de {totalPages}
          </span>
          <div className="flex gap-1">
            {pageNum > 1 && (
              <Link href={buildUrl({ page: String(pageNum - 1) })} className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center">
                ← Anterior
              </Link>
            )}
            {pageNum < totalPages && (
              <Link href={buildUrl({ page: String(pageNum + 1) })} className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center">
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
