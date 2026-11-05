"use client";

import { ReceiptText } from "lucide-react";
import { PAINEL, ROTULO, TEXTO_DE_APOIO, TITULO_DO_PAINEL } from "@/components/tributario/estilos";
import { brl, calculate, percent, type Data } from "@/lib/tributario/motor/fiscal";

// Portado do `ConsumptionSummary` do Connect Tributário (05/11/2026): mesmo
// cálculo (`calculate` do motor), mesmos textos e a mesma ordem. Em tela larga,
// como no original, o detalhamento vai para a coluna da direita.

export function ResumoDoConsumo({ d, year, valid }: { d: Data; year: number; valid: boolean }) {
  const r = calculate(d, year);
  const detalhamento: [string, number][] = [
    ["Débito nas vendas", r.debit],
    ["Crédito nas compras", r.credit],
    ["Saldo credor separado", r.balance],
    ["ICMS/ISS residual", r.old],
  ];

  return (
    <section className={PAINEL}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={ROTULO}>APURAÇÃO REGULAR</p>
          <h2 className={TITULO_DO_PAINEL}>CBS + IBS</h2>
        </div>
        <span className="grid size-9 flex-shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand" aria-hidden>
          <ReceiptText size={18} />
        </span>
      </div>

      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div className="min-w-0">
          <span className="block text-ui text-fg-secondary">Total estimado a recolher</span>
          <strong className="mt-1.5 block font-display text-metric font-bold leading-tight text-fg tnum [overflow-wrap:anywhere]">
            {valid ? brl(r.vat) : "—"}
          </strong>
          <span className="text-helper text-fg-muted">no ano de {year}</span>
          <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3">
            <div className="flex flex-col gap-1">
              <span className="text-ui text-fg-secondary">{d.activities.enabled ? "Débito CBS / receita" : "CBS aplicada"}</span>
              <b className="text-card-title font-semibold text-fg tnum">
                {valid ? percent(d.activities.enabled && d.revenue ? (r.cbsDebit / d.revenue) * 100 : r.cbs) : "—"}
              </b>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-ui text-fg-secondary">{d.activities.enabled ? "Débito IBS / receita" : "IBS aplicado"}</span>
              <b className="text-card-title font-semibold text-fg tnum">
                {valid ? percent(d.activities.enabled && d.revenue ? (r.ibsDebit / d.revenue) * 100 : r.ibs) : "—"}
              </b>
            </div>
          </div>
        </div>

        <dl className="grid gap-4 self-center">
          {detalhamento.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-4 text-ui">
              <dt className="text-fg-secondary">{rotulo}</dt>
              <dd className="whitespace-nowrap font-semibold text-fg tnum">{valid ? brl(valor) : "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className={TEXTO_DE_APOIO}>CBS e IBS calculados separadamente. Saldo credor não é tratado como recebimento.</p>
    </section>
  );
}
