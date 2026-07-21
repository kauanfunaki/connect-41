import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { EmpresaForm } from "@/components/empresas/EmpresaForm";
import { atualizarEmpresa } from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { getCompanySectors, getApplicableCustomFields } from "@/lib/customFields";
import { getActiveBranchOptions } from "@/lib/branches";

export default async function EditarEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
  });

  if (!company) notFound();

  const companySectors = await getCompanySectors(ctx.tenantId, id);
  const customFields = await getApplicableCustomFields(ctx, "COMPANY", id, companySectors);
  const branchOptions = await getActiveBranchOptions(ctx.tenantId);

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <Breadcrumb
        items={[
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${id}`, truncate: true },
          { label: "Editar" },
        ]}
      />

      <PageHeader title="Editar Empresa" />

      <EmpresaForm
          action={atualizarEmpresa}
          cancelHref={`/empresas/${id}`}
          customFields={customFields}
          branchOptions={branchOptions}
          defaultValues={{
            id,
            name:                  company.name,
            tradeName:             company.tradeName             ?? undefined,
            cnpj:                  company.cnpj                 ?? undefined,
            taxRegime:             company.taxRegime             ?? undefined,
            externalId:            company.externalId            ?? undefined,
            foundationDate:        company.foundationDate?.toISOString().slice(0, 10),
            cnaePrincipal:         company.cnaePrincipal         ?? undefined,
            cnaeSecundarios:       company.cnaeSecundarios       ?? undefined,
            zipCode:               company.zipCode               ?? undefined,
            addressStreet:         company.addressStreet         ?? undefined,
            addressNumber:         company.addressNumber         ?? undefined,
            addressComplement:     company.addressComplement     ?? undefined,
            neighborhood:          company.neighborhood          ?? undefined,
            city:                  company.city                  ?? undefined,
            stateCode:             company.stateCode             ?? undefined,
            stateRegistration:     company.stateRegistration     ?? undefined,
            municipalRegistration: company.municipalRegistration ?? undefined,
            nire:                  company.nire                  ?? undefined,
            email:                 company.email                 ?? undefined,
            phone:                 company.phone                 ?? undefined,
            website:               company.website               ?? undefined,
            status:                company.status,
            source:                company.source                ?? undefined,
            branchId:              company.branchId               ?? undefined,
          }}
        />
    </PageContainer>
  );
}
