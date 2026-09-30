import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { TagForm } from "@/components/admin/TagForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarTag } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";

export default async function NovaTagPage() {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();

  const { options: allSectorOptions } = await getSectorMaps(ctx.tenantId);
  const sectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Tags", href: "/admin/tags" }, { label: "Nova Tag" }]} />
      <PageHeader title="Nova Tag" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <TagForm action={criarTag} cancelHref="/admin/tags" sectorOptions={sectorOptions} />
        </Card>
      </div>
    </PageContainer>
  );
}
