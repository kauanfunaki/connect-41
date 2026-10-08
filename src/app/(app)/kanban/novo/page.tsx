import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { PipelineForm } from "@/components/kanban/PipelineForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarPipeline } from "../actions";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";

export default async function NovoKanbanPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const { options: allSectorOptions } = await getSectorMaps(ctx.tenantId);

  // SECTOR_ADMIN só pode criar kanban nos próprios setores; ADMIN/SUPER_ADMIN em qualquer um.
  const sectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Kanban", href: "/kanban" }, { label: "Novo kanban" }]} />
      <PageHeader title="Novo kanban" />

      <Card className="p-6 w-full max-w-[720px]">
        <PipelineForm action={criarPipeline} sectorOptions={sectorOptions} />
      </Card>
    </PageContainer>
  );
}
