import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { CampoForm } from "@/components/admin/CampoForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarCampo } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";

export default async function NovoCampoPage() {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();

  const { options: allSectorOptions } = await getSectorMaps(ctx.tenantId);
  const sectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Campos Customizados", href: "/admin/campos" }, { label: "Novo Campo" }]} />
      <PageHeader title="Novo Campo" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <CampoForm action={criarCampo} cancelHref="/admin/campos" sectorOptions={sectorOptions} />
        </Card>
      </div>
    </PageContainer>
  );
}
