import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { CargoForm } from "@/components/empresas/CargoForm";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { atualizarCargo } from "../../actions";

export default async function EditarCargoPage({
  params,
}: {
  params: Promise<{ id: string; cargoId: string }>;
}) {
  const { id: companyId, cargoId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const cargo = await prisma.cargo.findFirst({ where: { id: cargoId, tenantId: ctx.tenantId, companyId } });
  if (!cargo) notFound();

  // Famílias já em uso no tenant viram sugestão no campo — evita "Contábil" e
  // "Contabil" convivendo e quebrando o agrupamento da matriz.
  const familias = await prisma.cargo.findMany({
    where: { tenantId: ctx.tenantId, family: { not: null } },
    select: { family: true },
    distinct: ["family"],
    orderBy: { family: "asc" },
  });

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Cargos", href: `/empresas/${companyId}/cargos` },
          { label: "Editar" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Editar Cargo" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <Card className="px-6 py-5">
          <CargoForm
            action={atualizarCargo}
            companyId={companyId}
            cancelHref={`/empresas/${companyId}/cargos`}
            familiasExistentes={familias.map((f) => f.family!).filter(Boolean)}
            defaultValues={{
              id: cargo.id,
              name: cargo.name,
              area: cargo.area ?? undefined,
              family: cargo.family ?? undefined,
              seniority: cargo.seniority ?? undefined,
              description: cargo.description ?? undefined,
              technicalRequirements: cargo.technicalRequirements ?? undefined,
              behavioralRequirements: cargo.behavioralRequirements ?? undefined,
              salaryRangeMin: cargo.salaryRangeMin?.toString(),
              salaryRangeMid: cargo.salaryRangeMid?.toString(),
              salaryRangeMax: cargo.salaryRangeMax?.toString(),
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
