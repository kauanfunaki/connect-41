import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkles } from "lucide-react";
import { formatInstantDateTime } from "@/lib/format";
import {
  desfechoDaChamada,
  DESFECHO_LABEL,
  DESFECHO_VARIANTE,
  TRIGGER_LABEL,
  moeda,
} from "@/lib/ia/tela";
import type { ChamadaNaLista } from "@/lib/ia/data";

type Props = {
  chamadas: ChamadaNaLista[];
  /** Agora, do servidor — é o relógio que decide o que está abandonado. */
  agora: Date;
};

export function ChamadasDeIA({ chamadas, agora }: Props) {
  if (chamadas.length === 0) {
    return (
      <EmptyState
        title="Nenhuma chamada ainda"
        description="Toda vez que alguém usar a IA no Connect, a chamada aparece aqui — com quem pediu, sobre o quê e quanto custou."
        icon={<Sparkles />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">Quando</th>
            <th className="py-2 pr-3 font-medium">Agente</th>
            <th className="py-2 pr-3 font-medium">Quem pediu</th>
            <th className="py-2 pr-3 font-medium">Sobre</th>
            <th className="py-2 pr-3 font-medium text-right">Custo</th>
            <th className="py-2 pr-3 font-medium">Desfecho</th>
          </tr>
        </thead>
        <tbody>
          {chamadas.map((c) => {
            const desfecho = desfechoDaChamada(c, agora);
            return (
              <tr key={c.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums text-fg-secondary">
                  {formatInstantDateTime(c.startedAt)}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{c.agentLabel}</span>
                  <span className="block text-[11px] text-fg-muted">{c.model}</span>
                </td>
                <td className="py-2.5 pr-3 text-fg-secondary">
                  {c.userName ?? TRIGGER_LABEL[c.trigger] ?? c.trigger}
                </td>
                <td className="py-2.5 pr-3 text-fg-muted">
                  {c.entityType ? (
                    <span className="font-mono text-[11px]">
                      {c.entityType}
                      {c.entityId ? `:${c.entityId.slice(0, 8)}` : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {/* Traço, e não "R$ 0,00": custo não apurado não é chamada de
                      graça, e mostrar zero aqui seria a mesma mentira que o
                      resto da fundação evita. */}
                  {c.costCents === null ? (
                    <span className="text-warning" title="Modelo fora da tabela de preço">
                      não apurado
                    </span>
                  ) : (
                    moeda(c.costCents)
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={DESFECHO_VARIANTE[desfecho]}>{DESFECHO_LABEL[desfecho]}</Badge>
                  {c.error && (
                    <span className="block text-[11px] text-fg-muted truncate max-w-[260px]" title={c.error}>
                      {c.error}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
