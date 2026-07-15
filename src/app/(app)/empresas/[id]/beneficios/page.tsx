import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { BenefitType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
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

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {company.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Benefícios</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Benefícios</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {beneficios.length} benefício{beneficios.length !== 1 ? "s" : ""} cadastrado{beneficios.length !== 1 ? "s" : ""} nesta empresa
          </p>
        </div>
        {canManage && (
          <Link
            href={`/empresas/${companyId}/beneficios/novo`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Benefício
          </Link>
        )}
      </div>

      {beneficios.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhum benefício cadastrado ainda." />
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
