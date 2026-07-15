import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { formatCalendarDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AfastamentosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canViewMedical = await canViewSensitiveField(ctx, "DADOS_MEDICOS");

  const absences = await prisma.absence.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["AFASTADO", "RETORNO_PREVISTO", "EM_ANALISE"] } },
    orderBy: { returnDate: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Afastamentos Ativos</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {absences.length} afastamento{absences.length !== 1 ? "s" : ""} em aberto
        </p>
      </div>

      {absences.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhum afastamento ativo no momento." />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {absences.map((a) => (
            <Link
              key={a.id}
              href={`/pessoas/${a.person.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <div>
                <p className="text-[13px] text-fg">{a.person.name}</p>
                {canViewMedical && a.reason && (
                  <p className="text-[12px] text-fg-muted">{a.reason}</p>
                )}
              </div>
              <span className="text-[12px] text-fg-muted">
                Desde {formatCalendarDate(a.startDate)}
                {a.returnDate && ` · retorno previsto ${formatCalendarDate(a.returnDate)}`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
