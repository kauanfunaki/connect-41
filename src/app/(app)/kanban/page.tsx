import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Columns3, Plus } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { boardPath } from "@/lib/kanbanPaths";

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
      <PageHeader
        title="Kanban"
        subtitle={<>{pipelines.length} kanban{pipelines.length !== 1 ? "s" : ""} configurado{pipelines.length !== 1 ? "s" : ""}</>}
        action={<>{canCreate && (
          <Button
            href="/kanban/novo"
            variant="primary"
          >
            <Plus size={14} /> Novo kanban
          </Button>
        )}</>}
      />
      {pipelines.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Columns3 />}
            title="Nenhum kanban cadastrado ainda"
            description="Crie o primeiro kanban do setor pra começar a organizar o funil."
            // Era um <button> dentro de um <Link> (HTML inválido): o Button com href já é o link.
            action={canCreate ? <Button href="/kanban/novo"><Plus size={14} /> Novo kanban</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([sectorCode, list]) => (
            <div key={sectorCode}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: sectorColors[sectorCode] ?? "var(--c41-sector-gestao)" }}
                />
                <h2 className="text-card-title font-semibold text-fg">
                  {sectorLabel(sectorLabels, sectorCode)}
                </h2>
              </div>
              {/* Cartão-link no desenho único (07/10/2026): o `Card` com `href`
              (borda azul, sombra e sobe 2px no hover — o mesmo da
              FaixaDeTotais) e título em --fs-card-title. Eram três hovers e
              três tamanhos de título entre Kanban, Espaços, Pastas,
              Comunicados e Transferências. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {list.map((p, i) => (
                  <Card
                    key={p.id}
                    href={boardPath(p)}
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                    className="reveal-in p-4"
                  >
                    <p className="text-card-title font-semibold text-fg mb-1">{p.name}</p>
                    <p className="text-fs-2 text-fg-muted">
                      {p._count.items} {p._count.items === 1 ? "item" : "itens"} ·{" "}
                      {p.entityType === "COMPANY" ? "Empresas" : "Pessoas"}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
