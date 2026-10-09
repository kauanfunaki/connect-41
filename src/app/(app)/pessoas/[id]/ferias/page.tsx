import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
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
  const { ctx, setor } = await abrirTelaDoModulo("dp_colaboradores");
  const canEdit = canManageSector(ctx, setor);

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
        aba="trabalhista"
      />
      <PageHeader title="Férias" />

      <Card className="p-5">
        {vacations.length === 0 ? (
          <p className="text-fs-3 text-fg-muted mb-3">Nenhuma férias programada ainda.</p>
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
      </Card>
    </PageContainer>
  );
}
