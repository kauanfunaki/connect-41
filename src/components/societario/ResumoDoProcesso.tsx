import { Card } from "@/components/ui/Card";
import { formatInstantDate, formatarReaisDeCentavos } from "@/lib/format";
import { duracaoDoLancamento } from "@/lib/horas/edicao";
import type { Prazo } from "@/lib/societario/processo";

/**
 * O resumo do processo no alto da coluna da direita (Processo B, página de
 * opções de 04/11/2026): o prazo do tipo em barra e, embaixo, taxas, tempo
 * registrado e o próximo prazo — os números que se procuravam rolando até os
 * cartões de taxas e horas.
 *
 * A barra mede os dias úteis corridos contra o máximo previsto do tipo. Passou
 * do máximo, ela enche e fica vermelha; no limite, âmbar. Fluxo variável não
 * tem barra: o alvará não promete previsão (ver `prazoDoProcesso`).
 */
export function ResumoDoProcesso({
  prazo,
  encerrado,
  taxasCentavos,
  aPagarCentavos,
  minutos,
  proximoPrazo,
}: {
  prazo: Prazo;
  encerrado: boolean;
  taxasCentavos: number;
  aPagarCentavos: number;
  minutos: number;
  proximoPrazo: { quando: Date; onde: string } | null;
}) {
  const previsto =
    prazo.previstoMin !== null && prazo.previstoMax !== null && prazo.previstoMin !== prazo.previstoMax
      ? `${prazo.previstoMin}–${prazo.previstoMax}`
      : String(prazo.previstoMax ?? "");
  const temBarra = prazo.situacao !== "sem_previsao" && prazo.previstoMax !== null && prazo.previstoMax > 0;
  const fracao = temBarra ? Math.min(1, prazo.dias / prazo.previstoMax!) : 0;
  const corDaBarra =
    prazo.situacao === "estourado" ? "bg-danger" : prazo.situacao === "no_limite" ? "bg-warning" : "bg-brand-solid";
  const hoje = new Date();
  const prazoVencido = proximoPrazo !== null && proximoPrazo.quando.getTime() < hoje.getTime();

  return (
    <Card as="section" aria-labelledby="resumo-do-processo" className="p-4 flex flex-col gap-3">
      <h2 id="resumo-do-processo" className="text-section font-semibold text-fg">
        Resumo
      </h2>

      <div className="flex flex-col gap-1.5">
        <p className="c41-rotulo">{encerrado ? "Levou" : "Prazo do tipo"}</p>
        <p className="flex items-baseline gap-1.5 text-fg">
          <span
            className={`text-2xl font-semibold tabular-nums leading-none ${prazo.situacao === "estourado" ? "text-danger" : ""}`}
          >
            {prazo.dias}
          </span>
          <span className="text-fs-2 text-fg-muted">
            {prazo.situacao === "sem_previsao"
              ? "dias úteis · fluxo variável, sem previsão"
              : `de ${previsto} dias úteis${prazo.situacao === "estourado" ? " · estourado" : prazo.situacao === "no_limite" ? " · no limite" : ""}`}
          </span>
        </p>
        {temBarra && (
          <div
            role="meter"
            aria-label="Dias úteis contra o previsto do tipo"
            aria-valuemin={0}
            aria-valuemax={prazo.previstoMax!}
            aria-valuenow={Math.min(prazo.dias, prazo.previstoMax!)}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
          >
            <div className={`h-full rounded-full ${corDaBarra}`} style={{ width: `${Math.max(fracao * 100, 2)}%` }} />
          </div>
        )}
      </div>

      <dl className="flex flex-col divide-y divide-border-soft text-ui">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-fg-secondary">Taxas</dt>
          <dd className="text-right tabular-nums text-fg">
            <strong className="font-semibold">{formatarReaisDeCentavos(taxasCentavos)}</strong>
            {aPagarCentavos > 0 && <span className="block text-micro text-warning-fg">{formatarReaisDeCentavos(aPagarCentavos)} a pagar</span>}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-fg-secondary">Tempo registrado</dt>
          <dd className="font-semibold tabular-nums text-fg">{minutos > 0 ? duracaoDoLancamento(minutos) : "—"}</dd>
        </div>
        {!encerrado && (
          <div className="flex items-baseline justify-between gap-3 py-2 last:pb-0">
            <dt className="text-fg-secondary">Próximo prazo</dt>
            <dd className="text-right">
              {proximoPrazo ? (
                <>
                  <strong className={`font-semibold tabular-nums ${prazoVencido ? "text-danger" : "text-warning-fg"}`}>
                    {formatInstantDate(proximoPrazo.quando)}
                  </strong>
                  <span className="block text-micro text-fg-muted">{proximoPrazo.onde}</span>
                </>
              ) : (
                <span className="text-fg-muted">Nenhum</span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
