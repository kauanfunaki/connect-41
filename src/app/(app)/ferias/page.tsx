import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatCalendarDate } from "@/lib/format";

const ACTIVE_STATUSES = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;

export default async function FeriasPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const vacations = await prisma.vacation.findMany({
    where: { tenantId: ctx.tenantId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { concessivePeriodEnd: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  const now = new Date();
  const vencidas = vacations.filter((v) => v.concessivePeriodEnd && v.concessivePeriodEnd < now);
  const aVencer = vacations.filter((v) => !v.concessivePeriodEnd || v.concessivePeriodEnd >= now);

  return (
    <PageContainer>
      <PageHeader
        title="Férias"
        subtitle={<>{vacations.length} registro{vacations.length !== 1 ? "s" : ""} em aberto</>}
      />

      <Section title={`Vencidas (${vencidas.length})`} items={vencidas} empty="Nenhuma férias vencida." danger />
      <Section title={`A vencer / Programadas (${aVencer.length})`} items={aVencer} empty="Nenhuma férias a vencer." />
    </PageContainer>
  );
}

function Section({
  title,
  items,
  empty,
  danger,
}: {
  title: string;
  items: Array<{
    id: string;
    days: number;
    concessivePeriodEnd: Date | null;
    person: { id: string; name: string };
  }>;
  empty: string;
  danger?: boolean;
}) {
  return (
    <div className="mb-6">
      <h2 className={`text-[13px] font-semibold mb-2 ${danger ? "text-danger" : "text-fg"}`}>{title}</h2>
      {items.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-8 text-center text-[13px] text-fg-muted">{empty}</div>
      ) : (
        <Card className="divide-y divide-border">
          {items.map((v) => (
            <Link
              key={v.id}
              href={`/pessoas/${v.person.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <p className="text-[13px] text-fg">{v.person.name}</p>
              <span className="text-[12px] text-fg-muted">
                {v.days} dias
                {v.concessivePeriodEnd && ` · concessivo até ${formatCalendarDate(v.concessivePeriodEnd)}`}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
