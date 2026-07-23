import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddBeneficioForm } from "@/components/pessoas/AddBeneficioForm";
import { BeneficioRow } from "@/components/pessoas/BeneficioRow";
import { formatCalendarDate } from "@/lib/format";
import { vincularBeneficio, atualizarBeneficioAssignment, removerBeneficioAssignment } from "./actions";

export default async function BeneficiosPessoaPage({
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
    select: { id: true, name: true, currentCompanyId: true },
  });
  if (!person) notFound();

  const [beneficios, beneficiosDisponiveis] = await Promise.all([
    prisma.benefitAssignment.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { startDate: "desc" },
      include: { benefit: { select: { name: true } } },
    }),
    person.currentCompanyId
      ? prisma.benefitCatalog.findMany({
          where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const vincularBeneficioAction = vincularBeneficio.bind(null, id);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Cadastros</Link>
        <span className="text-fg-muted">/</span>
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Benefícios</span>
      </div>
      <BackButton className="mb-3" />

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Benefícios</h1>

      <div className="bg-surface border border-border rounded-lg p-5">
        {beneficios.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum benefício vinculado ainda.</p>
        ) : (
          <div>
            {beneficios.map((b) => (
              <BeneficioRow
                key={b.id}
                beneficio={{
                  id: b.id,
                  benefitName: b.benefit.name,
                  status: b.status,
                  companyValue: b.companyValue?.toString() ?? null,
                  discountValue: b.discountValue?.toString() ?? null,
                  startDateLabel: formatCalendarDate(b.startDate),
                  endDateLabel: b.endDate ? formatCalendarDate(b.endDate) : null,
                }}
                updateAction={atualizarBeneficioAssignment.bind(null, id, b.id)}
                removeAction={removerBeneficioAssignment.bind(null, id, b.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && <AddBeneficioForm action={vincularBeneficioAction} beneficios={beneficiosDisponiveis} />}
      </div>
    </PageContainer>
  );
}
