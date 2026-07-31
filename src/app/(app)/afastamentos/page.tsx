import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stethoscope } from "lucide-react";
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
      <PageHeader
        title="Afastamentos Ativos"
        subtitle={<>{absences.length} afastamento{absences.length !== 1 ? "s" : ""} em aberto</>}
      />

      {absences.length === 0 ? (
        <Card>
          <EmptyState icon={<Stethoscope />} title="Nenhum afastamento ativo" description="Afastamentos lançados na ficha de cada pessoa aparecem aqui enquanto estiverem ativos." />
        </Card>
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
