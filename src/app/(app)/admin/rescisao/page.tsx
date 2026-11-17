import { notFound } from "next/navigation";
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
    <PageContainer>
      <PageHeader
        title="Cálculo de rescisão — padrão do escritório"
      />

      {/* O aviso fixo de como o cálculo funciona foi para o artigo de ajuda (17/11/2026, melhoria-707). */}
      <RescisaoConfigForm action={salvarConfigTenant} valores={valores} nivelEmpresa={false} canEdit />
    </PageContainer>
  );
}
