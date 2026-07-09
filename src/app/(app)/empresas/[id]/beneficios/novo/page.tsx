import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { BenefitCatalogForm } from "@/components/empresas/BenefitCatalogForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarBeneficio } from "../actions";

export default async function NovoBeneficioPage({
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
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/beneficios`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">Benefícios</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Benefício — {company.name}</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <BenefitCatalogForm action={criarBeneficio} companyId={companyId} cancelHref={`/empresas/${companyId}/beneficios`} />
      </div>
    </PageContainer>
  );
}
