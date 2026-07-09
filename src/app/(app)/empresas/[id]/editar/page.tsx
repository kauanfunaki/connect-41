import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
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
      <div className="max-w-[1000px] mx-auto">
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/empresas"
          className="text-[13px] text-fg-muted hover:text-fg transition-colors"
        >
          Empresas
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/empresas/${id}`}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]"
        >
          {company.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em] mb-6">
        Editar Empresa
      </h1>

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
      </div>
    </PageContainer>
  );
}
