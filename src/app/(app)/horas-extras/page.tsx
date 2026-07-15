import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatCalendarDate } from "@/lib/format";

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
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Horas Extras Pendentes</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {entries.length} lançamento{entries.length !== 1 ? "s" : ""} aguardando aprovação
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum lançamento pendente de aprovação.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
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
        </div>
      )}
    </PageContainer>
  );
}
