import type { DistratoDTO } from "@/lib/honorarios/regras/auditDistrato";
import { dataCurta } from "@/lib/honorarios/rotulos";

/**
 * O distrato da empresa, embaixo da situação: o que encerra a prestação de
 * serviços (efetivo), o que foi deixado de lado por haver contrato mais novo e
 * os avisos de distrato do BPO ou social, que não encerram a contabilidade.
 */
export function AvisoDistrato({ distrato }: { distrato: DistratoDTO | null }) {
  if (!distrato) return null;
  const { efetivo, desconsiderado, avisos } = distrato;
  if (!efetivo && !desconsiderado && !avisos.length) return null;

  const porTipo = new Map<string, typeof avisos>();
  for (const a of avisos) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a]);

  return (
    <ul className="mt-1 space-y-0.5 text-micro text-fg-muted">
      {efetivo && (
        <li title={efetivo.caminhoRelativo}>
          {efetivo.dataFim ? `Serviços até ${dataCurta(efetivo.dataFim)}` : "Distrato na pasta"}
          {efetivo.assinado ? " · assinado" : <span className="text-warning-fg"> · sem assinatura</span>}
        </li>
      )}
      {desconsiderado && (
        <li title={desconsiderado.documento.caminhoRelativo}>
          Distrato desconsiderado: há contrato mais novo ({dataCurta(desconsiderado.contratoMaisNovoEm)})
        </li>
      )}
      {[...porTipo].map(([tipo, lista]) => {
        const fim = lista.map((a) => a.dataFim).filter((d): d is string => !!d).sort().at(-1);
        return (
          <li key={tipo} title={lista.map((a) => a.caminhoRelativo).join("\n")}>
            {tipo === "bpo" ? "Distrato do BPO (a contabilidade segue)" : "Distrato social (dissolução da empresa)"}
            {fim && ` · até ${dataCurta(fim)}`}
          </li>
        );
      })}
    </ul>
  );
}
