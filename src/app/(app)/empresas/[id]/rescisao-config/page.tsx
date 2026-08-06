import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { RescisaoConfigForm } from "@/components/rescisao/RescisaoConfigForm";
import { resolveRescisaoConfig } from "@/lib/rescisao/config";
import { salvarConfigEmpresa } from "@/app/(app)/admin/rescisao/actions";

export const metadata = { title: "Cálculo de rescisão" };

export default async function EmpresaRescisaoConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const [tenantRow, companyRow] = await Promise.all([
    prisma.tenantRescisaoConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    prisma.companyRescisaoConfig.findUnique({ where: { companyId } }),
  ]);

  // Resolve os dois níveis pra mostrar o valor EFETIVO com a origem de cada
  // campo — sem isso o usuário não sabe o que está herdando do escritório.
  const { valores, origem } = resolveRescisaoConfig(
    tenantRow ? { ...tenantRow, toleranciaPct: tenantRow.toleranciaPct != null ? Number(tenantRow.toleranciaPct) : null } : null,
    companyRow ? { ...companyRow, toleranciaPct: companyRow.toleranciaPct != null ? Number(companyRow.toleranciaPct) : null } : null
  );

  const canEdit = canWrite(ctx.role);

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {company.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Cálculo de rescisão</span>
      </div>
      <BackButton className="mb-3" />

      <PageHeader
        title="Cálculo de rescisão"
        subtitle={<>{company.name} — sobrescreve o padrão do escritório apenas nos campos que você alterar.</>}
      />

      <Card className="p-5 mb-4">
        <p className="text-[13px] text-fg-secondary">
          Cada campo mostra de onde vem o valor atual. Alterar aqui afeta só esta empresa.
        </p>
        <Link href="/admin/rescisao" className="inline-block mt-2 text-[12px] text-brand hover:underline">
          Ver o padrão do escritório
        </Link>
      </Card>

      <Card className="p-6">
        <RescisaoConfigForm
          action={salvarConfigEmpresa.bind(null, companyId)}
          valores={valores}
          origem={origem}
          nivelEmpresa
          canEdit={canEdit}
        />
      </Card>
    </PageContainer>
  );
}
