import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddEscalaForm } from "@/components/pessoas/AddEscalaForm";
import { EscalaRow } from "@/components/pessoas/EscalaRow";
import { formatCalendarDate } from "@/lib/format";
import { criarEscala, atualizarEscala, excluirEscala } from "./actions";

export default async function EscalaPage({
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
    select: { id: true, name: true, isInternal: true, currentCompanyId: true },
  });
  if (!person) notFound();

  const [escala, turnosDisponiveis] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { date: "desc" },
      include: { shift: { select: { name: true } } },
    }),
    person.currentCompanyId
      ? prisma.workShift.findMany({
          where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const criarEscalaAction = criarEscala.bind(null, id);

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Escala de Trabalho"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Escala de Trabalho" />

      <div className="bg-surface border border-border rounded-lg p-5">
        {escala.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhuma escala montada ainda.</p>
        ) : (
          <div>
            {escala.map((e) => (
              <EscalaRow
                key={e.id}
                escala={{
                  id: e.id,
                  dateLabel: formatCalendarDate(e.date),
                  shiftName: e.shift?.name ?? null,
                  dayOff: e.dayOff,
                  isHoliday: e.isHoliday,
                  status: e.status,
                }}
                updateAction={atualizarEscala.bind(null, id, e.id)}
                removeAction={excluirEscala.bind(null, id, e.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && <AddEscalaForm action={criarEscalaAction} shifts={turnosDisponiveis} />}
      </div>
    </PageContainer>
  );
}
