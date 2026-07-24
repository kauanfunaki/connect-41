import Link from "next/link";
import { Columns3 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityTimeline, type ActivityEntry } from "@/components/shared/ActivityTimeline";
import { boardPath } from "@/lib/kanbanPaths";

type PipelineEntry = {
  id: string;
  pipelineId: string;
  pipelineName: string;
  pipelineSectorCode: string;
  stageName: string;
};

type Props = {
  pipelineItems: PipelineEntry[];
  activities: ActivityEntry[];
  /** "empresa" (padrão) ou "pessoa" — usado só no texto do estado vazio. */
  entityLabel?: string;
};

// Agrega os PipelineItems (kanbans) e Activities ligados a esta entidade —
// Activity não tem FK direta pra Company/Person, só pra PipelineItem (relação
// polimórfica via entityType/entityId), então o histórico é montado aqui.
// Genérico o bastante pra ser reaproveitado no detalhe de pessoa também.
export function CompanyHistorySection({ pipelineItems, activities, entityLabel = "empresa" }: Props) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">Pipelines</h2>
        {pipelineItems.length === 0 ? (
          <EmptyState icon={<Columns3 />} title="Nenhum pipeline vinculado" description={`Esta ${entityLabel} ainda não está em nenhum Kanban.`} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {pipelineItems.map((p) => (
              <Link
                key={p.id}
                href={`${boardPath({ id: p.pipelineId, sectorCode: p.pipelineSectorCode })}/itens/${p.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[length:var(--fs-helper)] font-medium bg-surface-hover border border-border text-fg-secondary hover:text-fg hover:border-border-strong transition-colors"
              >
                {p.pipelineName}
                <span className="text-fg-muted">· {p.stageName}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">Atividades</h2>
        <ActivityTimeline activities={activities} emptyLabel="Nenhuma atividade registrada nos pipelines desta empresa." />
      </Card>
    </div>
  );
}
