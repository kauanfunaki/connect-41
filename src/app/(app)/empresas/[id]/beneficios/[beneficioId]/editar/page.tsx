import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { BenefitCatalogForm } from "@/components/empresas/BenefitCatalogForm";
import { atualizarBeneficio } from "../../actions";

export default async function EditarBeneficioPage({
  params,
}: {
  params: Promise<{ id: string; beneficioId: string }>;
}) {
  const { id: companyId, beneficioId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const beneficio = await prisma.benefitCatalog.findFirst({ where: { id: beneficioId, tenantId: ctx.tenantId, companyId } });
  if (!beneficio) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/beneficios`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">Benefícios</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Benefício — {company.name}</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <BenefitCatalogForm
          action={atualizarBeneficio}
          companyId={companyId}
          cancelHref={`/empresas/${companyId}/beneficios`}
          defaultValues={{
            id: beneficio.id,
            name: beneficio.name,
            type: beneficio.type,
            eligibilityRule: beneficio.eligibilityRule ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
