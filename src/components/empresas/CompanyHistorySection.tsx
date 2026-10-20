import { Columns3 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
        {/* "Atividades", o nome dos itens dos Quadros desde 20/10/2026 (Quadro ›
            Pasta › Tarefa › Atividade): foi "Pipelines" e, depois, "Tarefas". */}
        <h2 className="text-section font-semibold text-fg mb-4">Atividades</h2>
        {pipelineItems.length === 0 ? (
          <EmptyState icon={<Columns3 />} title="Nenhuma atividade ligada" description={`Esta ${entityLabel} ainda não está em nenhuma atividade dos Quadros.`} />
        ) : (
          // O `Button` com `href` (15/10/2026), e não pílulas-link montadas à mão.
          <div className="flex flex-wrap gap-2">
            {pipelineItems.map((p) => (
              <Button key={p.id} href={`${boardPath({ id: p.pipelineId })}/itens/${p.id}`} variant="secondary" size="sm">
                {p.pipelineName}
                <span className="font-normal text-fg-muted">· {p.stageName}</span>
              </Button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-section font-semibold text-fg mb-4">Atividades</h2>
        <ActivityTimeline activities={activities} emptyLabel="Nenhuma atividade registrada nos pipelines desta empresa." />
      </Card>
    </div>
  );
}
