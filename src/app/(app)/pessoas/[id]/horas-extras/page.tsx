import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddHoraExtraForm } from "@/components/pessoas/AddHoraExtraForm";
import { HoraExtraRow } from "@/components/pessoas/HoraExtraRow";
import { formatCalendarDate } from "@/lib/format";
import { criarHoraExtra, atualizarHoraExtra, excluirHoraExtra } from "./actions";

export default async function HorasExtrasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!person) notFound();

  const overtimeEntries = await prisma.overtimeEntry.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { date: "desc" },
  });

  const criarHoraExtraAction = criarHoraExtra.bind(null, id);

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Horas Extras</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Horas Extras</h1>

      <div className="bg-surface border border-border rounded-lg p-5">
        {overtimeEntries.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum lançamento de horas extras ainda.</p>
        ) : (
          <div>
            {overtimeEntries.map((o) => (
              <HoraExtraRow
                key={o.id}
                entry={{
                  id: o.id,
                  dateLabel: formatCalendarDate(o.date),
                  dayType: o.dayType,
                  overtimeHours: o.overtimeHours?.toString() ?? null,
                  status: o.status,
                  justification: o.justification,
                }}
                updateAction={atualizarHoraExtra.bind(null, id, o.id)}
                removeAction={excluirHoraExtra.bind(null, id, o.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && <AddHoraExtraForm action={criarHoraExtraAction} />}
      </div>
    </PageContainer>
  );
}
