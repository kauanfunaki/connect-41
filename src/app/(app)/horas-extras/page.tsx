import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Clock } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function HorasExtrasPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const entries = await prisma.overtimeEntry.findMany({
    where: { tenantId: ctx.tenantId, status: "PENDENTE_APROVACAO" },
    orderBy: { date: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Horas Extras Pendentes"
        subtitle={<>{entries.length} lançamento{entries.length !== 1 ? "s" : ""} aguardando aprovação</>}
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={<Clock />} title="Nenhum lançamento pendente" description="Lançamentos de horas extras aguardando aprovação aparecem aqui." />
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {entries.map((o) => (
            <Link
              key={o.id}
              href={`/pessoas/${o.person.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <p className="text-[13px] text-fg">{o.person.name}</p>
              <span className="text-[12px] text-fg-muted">
                {formatCalendarDate(o.date)}
                {o.overtimeHours && ` · ${o.overtimeHours.toString()}h extras`}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}
