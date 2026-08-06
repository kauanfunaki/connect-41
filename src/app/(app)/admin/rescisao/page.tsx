import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { RescisaoConfigForm } from "@/components/rescisao/RescisaoConfigForm";
import { resolveRescisaoConfig } from "@/lib/rescisao/config";
import { salvarConfigTenant } from "./actions";

export const metadata = { title: "Cálculo de rescisão" };

export default async function AdminRescisaoPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const row = await prisma.tenantRescisaoConfig.findUnique({ where: { tenantId: ctx.tenantId } });
  const { valores } = resolveRescisaoConfig(
    row ? { ...row, toleranciaPct: row.toleranciaPct != null ? Number(row.toleranciaPct) : null } : null,
    null
  );

  return (
    <PageContainer variant="narrow">
      <PageHeader
        title="Cálculo de rescisão — padrão do escritório"
        subtitle="Base usada por todas as empresas-cliente. Cada empresa pode sobrescrever o que for diferente na própria ficha."
      />

      <Card className="p-5 mb-4 border-brand/25">
        <p className="text-[13px] text-fg-secondary">
          O cálculo é <strong className="text-fg">referência para conferência</strong>, não apuração oficial: ele existe
          pra comparar com o que a contabilidade enviou no TRCT.
        </p>
        <p className="text-[12px] text-fg-muted mt-2">
          Constantes legais (1/3 constitucional, FGTS 8%, multa 40/20/0%, aviso de 30+3 dias por ano) não são
          configuráveis — vêm da lei e ficam fixas no sistema. Aqui você define só o que varia entre empresas.
        </p>
      </Card>

      <Card className="p-6">
        <RescisaoConfigForm action={salvarConfigTenant} valores={valores} nivelEmpresa={false} canEdit />
      </Card>
    </PageContainer>
  );
}
