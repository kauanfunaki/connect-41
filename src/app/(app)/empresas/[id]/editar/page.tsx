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
import { getActiveClientGroupOptions } from "@/lib/clientGroupsDb";
import { getMatrizOptions } from "@/lib/companyHierarchyDb";

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
  const clientGroupOptions = await getActiveClientGroupOptions(ctx.tenantId);
  const matrizOptions = await getMatrizOptions(ctx.tenantId, id);

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${id}`, truncate: true },
          { label: "Editar" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Editar Empresa" />

      <EmpresaForm
          action={atualizarEmpresa}
          cancelHref={`/empresas/${id}`}
          customFields={customFields}
          clientGroupOptions={clientGroupOptions}
          matrizOptions={matrizOptions}
          defaultValues={{
            id,
            name:                  company.name,
            tradeName:             company.tradeName             ?? undefined,
            displayName:           company.displayName           ?? undefined,
            kind:                  company.kind,
            cnpj:                  company.cnpj                 ?? undefined,
            cpf:                   company.cpf                  ?? undefined,
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
            clientGroupId:         company.clientGroupId          ?? undefined,
            parentCompanyId:       company.parentCompanyId        ?? undefined,
          }}
        />
    </PageContainer>
  );
}
