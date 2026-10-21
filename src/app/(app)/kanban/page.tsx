import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Columns3 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovoKanban } from "@/components/kanban/NovoKanban";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { boardPath } from "@/lib/kanbanPaths";

export default async function KanbanListPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const { labels: sectorLabels, colors: sectorColors, options: allSectorOptions } = await getSectorMaps(ctx.tenantId);
  // `?novo=1` é o endereço antigo /kanban/novo: a lista abre com a janela aberta.
  const { novo } = await searchParams;
  // SECTOR_ADMIN só pode criar kanban nos próprios setores; ADMIN/SUPER_ADMIN em qualquer um.
  const sectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

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
        title="Todas as tarefas"
        subtitle={<>{pipelines.length} tarefa{pipelines.length !== 1 ? "s" : ""} de todos os seus setores</>}
        action={canCreate ? <NovoKanban key={novo === "1" ? "novo" : "lista"} sectorOptions={sectorOptions} abertaDeInicio={novo === "1"} /> : undefined}
      />
      {pipelines.length === 0 ? (
        <Card>
          {/* Sem repetir o "Novo kanban": ele mora no cabeçalho, e o texto diz onde
              (P19, 15/10/2026). */}
          <EmptyState
            icon={<Columns3 />}
            title="Nenhuma tarefa cadastrada ainda"
            description={
              canCreate
                ? "Use “+ Nova tarefa”, no alto da tela, para criar a primeira do setor e começar a organizar o trabalho."
                : "As tarefas dos setores aparecem aqui quando forem criadas."
            }
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
                <h2 className="text-section font-semibold text-fg">
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
