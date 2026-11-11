import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { RescisaoConfigForm } from "@/components/rescisao/RescisaoConfigForm";
import { resolveRescisaoConfig } from "@/lib/rescisao/config";
import { salvarConfigEmpresa } from "@/app/(app)/admin/rescisao/actions";
import { registroDaRota } from "@/lib/enderecoCurtoServidor";
import { endereco } from "@/lib/enderecoCurto";

export const metadata = { title: "Cálculo de rescisão" };

export default async function EmpresaRescisaoConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idDaRota } = await params;
  const ctx = await getAuthContext();
  // A empresa pelo uuid ou pelo id curto, /empresas/empresa-301/… (10/11/2026, pedido do Kauan).
  const { id: companyId, number: numeroDaEmpresa } = await registroDaRota("empresa", ctx.tenantId, idDaRota, "/rescisao-config");
  const fichaDaEmpresa = endereco("empresa", numeroDaEmpresa);

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
    <PageContainer>
      {/* A trilha padrão das sub-páginas da empresa (era uma cópia à mão, com
          outro espaçamento). */}
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `${fichaDaEmpresa}?tab=operations`, truncate: true },
          { label: "Cálculo de rescisão" },
        ]}
      />

      <PageHeader
        title="Cálculo de rescisão"
        subtitle={<>{company.name} — sobrescreve o padrão do escritório apenas nos campos que você alterar.</>}
      />

      {/* Aviso e ação na mesma linha. Embaixo, as seções em duas colunas do
          formulário (1B, 20/10/2026), cada uma com o seu cartão. */}
      <Card className="p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-body text-fg-secondary">
          Cada campo mostra de onde vem o valor atual. Alterar aqui afeta só esta empresa.
        </p>
        {/* Era link de texto sublinhado (30/09): é ação, então é botão. */}
        <Button href="/admin/rescisao" variant="secondary" size="sm">
          Ver o padrão do escritório <ArrowRight size={14} />
        </Button>
      </Card>

      <RescisaoConfigForm
        action={salvarConfigEmpresa.bind(null, companyId)}
        valores={valores}
        origem={origem}
        nivelEmpresa
        canEdit={canEdit}
      />
    </PageContainer>
  );
}
