import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { formatInstantDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

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
  "tenant.ai.update": "configurou a integração de IA",
  "tenant.ai.remove": "removeu a configuração de IA",
  "companyservice.create": "adicionou um setor contratado",
  "companyservice.assign": "atribuiu responsável de setor",
  "meeting.create": "agendou uma reunião",
  "meeting.update": "editou uma reunião",
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
      <PageHeader
        title="Auditoria"
        subtitle={<>{total} {total === 1 ? "ação registrada" : "ações registradas"} neste workspace — criação, edição e
          exclusão em Empresas, Pessoas, Transferências e Configurações.</>}
      />

      {/* Usuário, ação e entidade no botão "Filtros" — eram três selects que
          navegavam sozinhos, com um "Limpar filtros" em texto cinza. O período
          fica ao lado, porque data se digita, não se escolhe numa lista
          (conferência de 30/09). */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FiltrosDaTela
          campos={[
            {
              chave: "userId",
              rotulo: "Usuário",
              vazioLabel: "Todos os usuários",
              opcoes: users.map((u) => ({ value: u.id, label: u.name })),
            },
            {
              chave: "action",
              rotulo: "Ação",
              vazioLabel: "Todas as ações",
              opcoes: actionRows.map((r) => ({ value: r.action, label: ACTION_LABEL[r.action] ?? r.action })),
            },
            {
              chave: "entityType",
              rotulo: "Entidade",
              vazioLabel: "Todas as entidades",
              opcoes: entityTypeRows.map((r) => ({ value: r.entityType as string, label: r.entityType as string })),
            },
          ]}
        />
        <form method="GET" action="/admin/auditoria" className="flex flex-wrap items-center gap-2">
          {userId && <input type="hidden" name="userId" value={userId} />}
          {action && <input type="hidden" name="action" value={action} />}
          {entityType && <input type="hidden" name="entityType" value={entityType} />}
          <Input compact type="date" name="from" defaultValue={from ?? ""} className="w-40" aria-label="De" />
          <span className="text-[12px] text-fg-muted">a</span>
          <Input compact type="date" name="to" defaultValue={to ?? ""} className="w-40" aria-label="Até" />
          <Button type="submit" variant="secondary" size="sm">
            Filtrar período
          </Button>
          {(from || to) && (
            <Button href={buildUrl({ from: undefined, to: undefined, page: undefined })} variant="ghost" size="sm">
              Limpar período
            </Button>
          )}
        </form>
      </div>

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText />}
            title={hasFilters ? "Nenhuma ação encontrada com esses filtros." : "Nenhuma ação registrada ainda."}
          />
        </Card>
      ) : (
        // Tabela no casco padrão (era uma lista de linhas soltas). Sem funil
        // nas colunas: a trilha é paginada no servidor, e usuário, ação e
        // entidade já estão no botão "Filtros" logo acima.
        <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const detail = describeMetadata(log.metadata);
                return (
                  <tr key={log.id} className="border-b border-border">
                    <td className="px-4 py-3 text-fg-muted whitespace-nowrap">
                      {formatInstantDateTime(log.createdAt, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-fg">{log.user.name}</td>
                    <td className="px-4 py-3 text-fg-secondary">{ACTION_LABEL[log.action] ?? log.action}</td>
                    <td className="px-4 py-3">
                      {log.entityType ? <Badge variant="info">{log.entityType}</Badge> : <span className="text-fg-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {detail ? (
                        <span className="block max-w-[320px] text-[11px] text-fg-muted font-mono truncate" title={detail}>
                          {detail}
                        </span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={pageNum}
        totalPages={totalPages}
        buildHref={(p) => buildUrl({ page: String(p) })}
        total={total}
        rotulo={total === 1 ? "ação" : "ações"}
      />
    </PageContainer>
  );
}
