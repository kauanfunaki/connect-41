import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { tomDoEstado } from "@/components/revisao-contabil/tons";
import { MANUAL_NOTE, manualSummary } from "@/lib/revisao-contabil/motor/relatorio";
import type { ItemDoManual } from "@/lib/revisao-contabil/motor/tipos";

/**
 * A conferência por item do "Manual de Conferência do Balanço" do time: cada
 * item com o estado e as linhas do motor que deram o estado. O mapeamento, as
 * gravidades e a numeração ainda esperam a validação do time contábil.
 */
export function AbaManual({ manual }: { manual: ItemDoManual[] | undefined }) {
  if (!manual?.length) return <EmptyState title="Ainda não analisado" description="A matriz do manual aparece depois da primeira análise." />;
  const secoes = [...new Set(manual.map((m) => m.section))];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ui text-fg-secondary">
        {manualSummary(manual)}. {MANUAL_NOTE}
      </p>
      {secoes.map((s) => {
        const itens = manual.filter((m) => m.section === s);
        return (
          <Card as="section" key={s} className="p-4">
            <h2 className="mb-2 text-label font-semibold text-fg">
              {itens[0].item.split(".")[0]}. {s}
            </h2>
            <ul className="flex flex-col divide-y divide-border">
              {itens.map((m, i) => (
                <li key={`${m.item}-${i}`} className="flex flex-col gap-1 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-ui text-fg">
                      <span className="font-medium tabular-nums">{m.item}</span> {m.title}
                    </span>
                    <Selo tom={tomDoEstado(m.status)}>{m.status}</Selo>
                  </div>
                  {m.refs.length > 0 && (
                    <ul className="flex flex-col gap-0.5 text-helper text-fg-muted">
                      {m.refs.map((ref, j) => (
                        <li key={`${ref.id}-${j}`}>
                          {ref.id} · {ref.title} — {ref.status}
                          {ref.parts?.length ? ` (${ref.parts.map((p) => `${p.name}: ${p.status}`).join(", ")})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.note && <p className="text-helper text-fg-muted">{m.note}</p>}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
