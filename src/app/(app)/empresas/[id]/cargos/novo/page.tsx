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
import { criarCargo } from "../actions";

export default async function NovoCargoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Cargos", href: `/empresas/${companyId}/cargos` },
          { label: "Novo" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Novo Cargo" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <Card className="px-6 py-5">
          <CargoForm action={criarCargo} companyId={companyId} cancelHref={`/empresas/${companyId}/cargos`} />
        </Card>
      </div>
    </PageContainer>
  );
}
