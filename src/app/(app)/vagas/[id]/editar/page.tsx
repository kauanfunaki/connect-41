import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { VagaForm } from "@/components/vagas/VagaForm";
import { atualizarVaga } from "../../actions";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

export default async function EditarVagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!vaga) notFound();
  if (!canManageSector(ctx, vaga.sectorCode)) notFound();

  const { options: sectorOptions } = await getSectorMaps(ctx.tenantId);

  const [companies, cargos, users] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cargo.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PageContainer>
      <Breadcrumb
        items={[{ label: "Vagas", href: "/vagas" }, { label: vaga.title, href: `/vagas/${id}`, truncate: true }, { label: "Editar" }]}
      />
      <PageHeader title="Editar vaga" />

      <Card className="p-6">
        <VagaForm
          action={atualizarVaga}
          cancelHref={`/vagas/${id}`}
          companies={companies}
          cargos={cargos}
          users={users}
          sectorOptions={sectorOptions}
          defaultValues={{
            id: vaga.id,
            title: vaga.title,
            companyId: vaga.companyId,
            sectorCode: vaga.sectorCode,
            cargoId: vaga.cargoId ?? undefined,
            quantity: vaga.quantity,
            responsibleUserId: vaga.responsibleUserId ?? undefined,
            priority: vaga.priority,
            notes: vaga.notes ?? undefined,
            isPublic: vaga.isPublic,
            publicDescription: vaga.publicDescription ?? undefined,
            salaryMin: vaga.salaryMin === null ? null : vaga.salaryMin.toNumber(),
            salaryMax: vaga.salaryMax === null ? null : vaga.salaryMax.toNumber(),
            showSalary: vaga.showSalary,
            workMode: vaga.workMode,
            contractType: vaga.contractType,
            benefits: vaga.benefits,
            applicationDeadline: vaga.applicationDeadline ? vaga.applicationDeadline.toISOString().slice(0, 10) : null,
            workCity: vaga.workCity,
            workStateCode: vaga.workStateCode,
          }}
        />
      </Card>
    </PageContainer>
  );
}
