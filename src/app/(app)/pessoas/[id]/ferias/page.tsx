import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddFeriasForm } from "@/components/pessoas/AddFeriasForm";
import { FeriasRow } from "@/components/pessoas/FeriasRow";
import { formatCalendarDate } from "@/lib/format";
import { criarFerias, atualizarFerias, excluirFerias } from "./actions";

export default async function FeriasPage({
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
    select: { id: true, name: true, isInternal: true },
  });
  if (!person) notFound();

  const vacations = await prisma.vacation.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { acquisitivePeriodStart: "desc" },
  });

  const criarFeriasAction = criarFerias.bind(null, id);

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Férias"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Férias" />

      <div className="bg-surface border border-border rounded-lg p-5">
        {vacations.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhuma férias programada ainda.</p>
        ) : (
          <div>
            {vacations.map((v) => (
              <FeriasRow
                key={v.id}
                ferias={{
                  id: v.id,
                  status: v.status,
                  acquisitivePeriodLabel: `${formatCalendarDate(v.acquisitivePeriodStart)} — ${formatCalendarDate(v.acquisitivePeriodEnd)}`,
                  concessivePeriodLabel: v.concessivePeriodStart && v.concessivePeriodEnd
                    ? `${formatCalendarDate(v.concessivePeriodStart)} — ${formatCalendarDate(v.concessivePeriodEnd)}`
                    : null,
                  days: v.days,
                  isVencida: !!v.concessivePeriodEnd && v.concessivePeriodEnd < new Date() && !["CONCLUIDA", "CANCELADA"].includes(v.status),
                }}
                updateAction={atualizarFerias.bind(null, id, v.id)}
                removeAction={excluirFerias.bind(null, id, v.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && <AddFeriasForm action={criarFeriasAction} />}
      </div>
    </PageContainer>
  );
}
