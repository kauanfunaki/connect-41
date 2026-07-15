import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { formatInstantDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

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

function describeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// Só SUPER_ADMIN acessa — trilha de auditoria é informação sensível cross-setor.
export default async function AuditoriaPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } } },
  });

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Auditoria</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Últimas {logs.length} ações registradas neste workspace — criação, edição e exclusão em
          Empresas, Pessoas, Transferências e Configurações.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhuma ação registrada ainda." />
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
    </PageContainer>
  );
}
