import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { BenefitType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/shared/BackButton";
import { excluirBeneficio } from "./actions";

const TYPE_LABEL: Record<BenefitType, string> = {
  VALE_REFEICAO:       "Vale-refeição",
  VALE_ALIMENTACAO:    "Vale-alimentação",
  VALE_TRANSPORTE:     "Vale-transporte",
  AUXILIO_COMBUSTIVEL: "Auxílio combustível",
  PLANO_SAUDE:         "Plano de saúde",
  PLANO_ODONTOLOGICO:  "Plano odontológico",
  CONVENIO_FARMACIA:   "Convênio farmácia",
  CONVENIO_SESC:       "Convênio SESC",
  TOTALPASS:           "TotalPass",
  AUXILIO_EDUCACAO:    "Auxílio educação",
  ASSIDUIDADE:         "Assiduidade",
  OUTRO:               "Outro",
};

export default async function BeneficiosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const beneficios = await prisma.benefitCatalog.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  const novoHref = `/empresas/${companyId}/beneficios/novo`;

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <Breadcrumb
        items={[
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}`, truncate: true },
          { label: "Benefícios" },
        ]}
      />

      <PageHeader
        title="Benefícios"
        subtitle={`${beneficios.length} benefício${beneficios.length !== 1 ? "s" : ""} cadastrado${beneficios.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Link
              href={novoHref}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
            >
              + Novo Benefício
            </Link>
          )
        }
      />

      {beneficios.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Gift />}
            title="Nenhum benefício cadastrado"
            description="Cadastre os benefícios oferecidos aos colaboradores desta empresa, como vale-refeição, plano de saúde ou auxílio-transporte."
            action={
              canManage && (
                <Link
                  href={novoHref}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
                >
                  + Cadastrar benefício
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {beneficios.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] text-fg font-medium">{b.name}</p>
                <p className="text-[12px] text-fg-muted">{TYPE_LABEL[b.type]}</p>
              </div>
              {canManage && (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/empresas/${companyId}/beneficios/${b.id}/editar`}
                    className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    Editar
                  </Link>
                  <DeleteFieldButton action={excluirBeneficio.bind(null, b.id, companyId)} nome={b.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
