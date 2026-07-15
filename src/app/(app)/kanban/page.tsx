import Link from "next/link";
import { Columns3 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";

export default async function KanbanListPage() {
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);

  const prisma = getPrisma();
  const pipelines = await prisma.pipeline.findMany({
    where: scopedPipelineWhere(ctx),
    orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  const grouped = pipelines.reduce<Record<string, typeof pipelines>>((acc, p) => {
    (acc[p.sectorCode] ??= []).push(p);
    return acc;
  }, {});

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Kanban</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {pipelines.length} kanban{pipelines.length !== 1 ? "s" : ""} configurado{pipelines.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/kanban/novo"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Kanban
          </Link>
        )}
      </div>

      {pipelines.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<Columns3 />}
            title="Nenhum kanban cadastrado ainda"
            description="Crie o primeiro kanban do setor pra começar a organizar o funil."
            action={canCreate ? <Link href="/kanban/novo"><Button>+ Novo Kanban</Button></Link> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([sectorCode, list]) => (
            <div key={sectorCode}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: sectorColors[sectorCode] ?? "#586577" }}
                />
                <h2 className="text-[15px] font-medium text-fg">
                  {sectorLabel(sectorLabels, sectorCode)}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {list.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/kanban/${p.id}`}
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                    className="reveal-in bg-surface border border-border rounded-lg p-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform]"
                  >
                    <p className="text-[13px] font-medium text-fg mb-1">{p.name}</p>
                    <p className="text-[12px] text-fg-muted">
                      {p._count.items} {p._count.items === 1 ? "item" : "itens"} ·{" "}
                      {p.entityType === "COMPANY" ? "Empresas" : "Pessoas"}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
