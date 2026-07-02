import Link from "next/link";
import { notFound } from "next/navigation";
import { PipelineForm } from "@/components/kanban/PipelineForm";
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/kanban" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Kanban
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Kanban</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Kanban</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <PipelineForm action={criarPipeline} sectorOptions={sectorOptions} />
      </div>
    </div>
  );
}
