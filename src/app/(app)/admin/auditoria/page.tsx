import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { formatInstantDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuditoriaFilters } from "@/components/admin/AuditoriaFilters";

const ACTION_LABEL: Record<string, string> = {
  "company.create": "criou a empresa",
  "company.update": "editou a empresa",
  "company.delete": "excluiu a empresa",
  "person.create": "criou a pessoa",
  "person.update": "editou a pessoa",
  "person.delete": "excluiu a pessoa",
  "handoff.create": "solicitou transferência",
  "handoff.accept": "aceitou transferência",
  "handoff.reject": "rejeitou transferência",
  "handoff.assign": "atribuiu responsável de transferência",
  "sector.create": "criou o setor",
  "sector.update": "editou o setor",
  "tag.create": "criou a tag",
  "tag.update": "editou a tag",
  "tag.delete": "excluiu a tag",
  "customfield.create": "criou o campo customizado",
  "customfield.update": "editou o campo customizado",
  "customfield.delete": "excluiu o campo customizado",
  "branch.create": "criou a filial",
  "branch.update": "editou a filial",
  "competency.create": "criou a competência",
  "competency.update": "editou a competência",
  "competency.delete": "excluiu a competência",
  "holiday.create": "cadastrou o feriado",
  "holiday.delete": "excluiu o feriado",
  "holiday.import": "importou feriados nacionais",
  "module.enable": "ativou o módulo",
  "module.disable": "desativou o módulo",
  "user.create": "criou o usuário",
  "user.update": "editou o usuário",
  "user.activate": "ativou o usuário",
  "user.deactivate": "desativou o usuário",
  "tenant.update": "editou os dados do tenant",
  "companyservice.create": "adicionou um setor contratado",
  "companyservice.assign": "atribuiu responsável de setor",
  "meeting.create": "agendou uma reunião",
  "meeting.delete": "removeu uma reunião",
  "integration.connect": "conectou uma integração",
  "integration.disconnect": "desconectou uma integração",
};

const PER_PAGE = 50;

function describeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// Só SUPER_ADMIN acessa — trilha de auditoria é informação sensível cross-setor.
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { userId, action, entityType, from, to, page } = await searchParams;
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const where = {
    tenantId: ctx.tenantId,
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [logs, total, users, actionRows, entityTypeRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entityType: { not: null } },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasFilters = !!(userId || action || entityType || from || to);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { userId, action, entityType, from, to, page, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/admin/auditoria?${q.toString()}`;
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Auditoria</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {total} {total === 1 ? "ação registrada" : "ações registradas"} neste workspace — criação, edição e
          exclusão em Empresas, Pessoas, Transferências e Configurações.
        </p>
      </div>

      <AuditoriaFilters
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        actions={actionRows.map((r) => ({ value: r.action, label: ACTION_LABEL[r.action] ?? r.action }))}
        entityTypes={entityTypeRows.map((r) => ({ value: r.entityType as string, label: r.entityType as string }))}
        userId={userId ?? ""}
        action={action ?? ""}
        entityType={entityType ?? ""}
      />

      <form method="GET" action="/admin/auditoria" className="flex items-end gap-3 mb-4">
        {userId && <input type="hidden" name="userId" value={userId} />}
        {action && <input type="hidden" name="action" value={action} />}
        {entityType && <input type="hidden" name="entityType" value={entityType} />}
        <div>
          <label className="block text-[11px] text-fg-muted mb-1">De</label>
          <Input type="date" name="from" defaultValue={from ?? ""} className="w-auto" />
        </div>
        <div>
          <label className="block text-[11px] text-fg-muted mb-1">Até</label>
          <Input type="date" name="to" defaultValue={to ?? ""} className="w-auto" />
        </div>
        <button
          type="submit"
          className="h-9 px-4 rounded-md border border-border-strong text-[13px] font-medium text-fg-secondary hover:bg-surface-2 transition-colors"
        >
          Filtrar
        </button>
      </form>

      {logs.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            title={hasFilters ? "Nenhuma ação encontrada com esses filtros." : "Nenhuma ação registrada ainda."}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {logs.map((log) => {
            const detail = describeMetadata(log.metadata);
            return (
              <div key={log.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-fg">
                    <span className="font-medium">{log.user.name}</span>{" "}
                    {ACTION_LABEL[log.action] ?? log.action}
                    {log.entityType && (
                      <Badge variant="info" className="ml-2">
                        {log.entityType}
                      </Badge>
                    )}
                  </p>
                  {detail && <p className="text-[11px] text-fg-muted font-mono mt-0.5 truncate">{detail}</p>}
                </div>
                <span className="text-[12px] text-fg-muted tnum flex-shrink-0">
                  {formatInstantDateTime(log.createdAt, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
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
