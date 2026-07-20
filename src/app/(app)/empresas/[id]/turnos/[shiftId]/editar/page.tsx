import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { WorkShiftForm } from "@/components/empresas/WorkShiftForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { atualizarTurno } from "../../actions";

export default async function EditarTurnoPage({
  params,
}: {
  params: Promise<{ id: string; shiftId: string }>;
}) {
  const { id: companyId, shiftId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const turno = await prisma.workShift.findFirst({ where: { id: shiftId, tenantId: ctx.tenantId, companyId } });
  if (!turno) notFound();

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <Breadcrumb
        items={[
          { label: "Empresas", href: "/empresas" },
          { label: "Turnos", href: `/empresas/${companyId}/turnos` },
          { label: "Editar" },
        ]}
      />

      <PageHeader title="Editar Turno" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <WorkShiftForm
            action={atualizarTurno}
            companyId={companyId}
            cancelHref={`/empresas/${companyId}/turnos`}
            defaultValues={{ id: turno.id, name: turno.name, startTime: turno.startTime, endTime: turno.endTime }}
          />
        </div>
      </div>
    </PageContainer>
  );
}
