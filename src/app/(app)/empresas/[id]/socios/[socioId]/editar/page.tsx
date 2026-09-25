import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { SocioForm } from "@/components/empresas/SocioForm";
import { campoDaData } from "@/lib/societario/datas";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { atualizarSocio } from "../../actions";

export default async function EditarSocioPage({
  params,
}: {
  params: Promise<{ id: string; socioId: string }>;
}) {
  const { id: companyId, socioId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: {
      id: true,
      name: true,
      zipCode: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      neighborhood: true,
      city: true,
      stateCode: true,
    },
  });
  if (!company) notFound();

  const socio = await prisma.companyPartner.findFirst({
    where: { id: socioId, tenantId: ctx.tenantId, companyId },
  });
  if (!socio) notFound();

  const endereco = {
    zipCode: company.zipCode,
    addressStreet: company.addressStreet,
    addressNumber: company.addressNumber,
    addressComplement: company.addressComplement,
    neighborhood: company.neighborhood,
    city: company.city,
    stateCode: company.stateCode,
  };

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Sócios", href: `/empresas/${companyId}/socios` },
          { label: socio.name, truncate: true },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Editar Sócio" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-lg p-6">
          <SocioForm
            action={atualizarSocio}
            companyId={companyId}
            enderecoDaEmpresa={endereco}
            cancelHref={`/empresas/${companyId}/socios`}
            defaultValues={{
              id: socio.id,
              name: socio.name,
              document: socio.document,
              administrator: socio.administrator,
              // Decimal do Prisma: vira texto para o input, sem passar por
              // Number — 33.3333 não sobrevive a um `toFixed` distraído.
              sharePercent: socio.sharePercent === null ? null : String(socio.sharePercent),
              qualification: socio.qualification,
              quotas: socio.quotas === null ? null : String(socio.quotas),
              capitalAmount: socio.capitalAmount === null ? null : String(socio.capitalAmount).replace(".", ","),
              entryDate: campoDaData(socio.entryDate),
              exitDate: campoDaData(socio.exitDate),
              documentMasked: socio.documentMasked,
              zipCode: socio.zipCode,
              addressStreet: socio.addressStreet,
              addressNumber: socio.addressNumber,
              addressComplement: socio.addressComplement,
              neighborhood: socio.neighborhood,
              city: socio.city,
              stateCode: socio.stateCode,
            }}
          />
        </div>
      </div>
    </PageContainer>
  );
}
