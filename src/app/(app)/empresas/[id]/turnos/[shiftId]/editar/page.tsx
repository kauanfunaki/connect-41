import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { WorkShiftForm } from "@/components/empresas/WorkShiftForm";
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/turnos`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">Turnos</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Turno — {company.name}</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <WorkShiftForm
          action={atualizarTurno}
          companyId={companyId}
          cancelHref={`/empresas/${companyId}/turnos`}
          defaultValues={{ id: turno.id, name: turno.name, startTime: turno.startTime, endTime: turno.endTime }}
        />
      </div>
    </div>
  );
}
