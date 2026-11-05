"use client";

// "Quatro cenários. Uma visão clara." — o bloco `comparison` do workspace do
// Connect Tributário: o ano da projeção, os quatro cartões (Simples, Simples
// híbrido, Presumido e Real) com situação e pendências, a receita, os custos
// e o resultado de referência, e o alcance do cálculo.

import { CheckCircle2, FileText, SlidersHorizontal } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import type { Study } from "@/lib/tributario/avaliacao/model";
import { brl, percent, years } from "@/lib/tributario/motor/fiscal";
import { NOTA, PAINEL, ROTULO, TEXTO_DE_APOIO, TITULO_DA_SECAO } from "../estilos";
import type { IrPara, ResultadoDaAvaliacao } from "../tipos";

type Props = { estudo: Study; resultado: ResultadoDaAvaliacao; ano: number; onAno: (ano: number) => void; irPara: IrPara };

export function Comparativo({ estudo, resultado, ano, onAno, irPara }: Props) {
  return (
    <section className={PAINEL} id="comparativo-da-avaliacao">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={ROTULO}>Do dado à decisão</p>
          <h2 className={TITULO_DA_SECAO}>Quatro cenários. Uma visão clara.</h2>
          <p className={TEXTO_DE_APOIO}>Tributos e encargos estimados para a base anual.</p>
        </div>
        <CampoForm label="Projeção" htmlFor="comparativo-ano" className="w-32">
          <Select id="comparativo-ano" compact value={ano} onChange={(e) => onAno(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </CampoForm>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {resultado.cards.map((c, i) => {
          const melhor = resultado.best === c.key;
          return (
            <article
              key={c.key}
              className={`flex flex-col gap-2 rounded-lg border p-4 ${melhor ? "border-success-solid bg-success-bg/40" : "border-border bg-surface"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-micro font-semibold text-fg-muted tabular-nums">0{i + 1}</span>
                <span className="text-micro text-fg-muted">{c.status}</span>
              </div>
              <h3 className="text-card-title font-semibold text-fg">{c.name}</h3>
              <strong className="text-section font-semibold text-fg tabular-nums">{c.value === null ? "—" : brl(c.value)}</strong>
              <p className={TEXTO_DE_APOIO}>
                {c.rate === null ? "Complete os dados indicados abaixo" : `${percent(c.rate)} da receita projetada`}
              </p>
              {c.value !== null && c.eligibility === "unknown" && (
                <small className="text-helper text-warning-fg">Elegibilidade ainda não verificada.</small>
              )}
              {melhor && (
                <Selo tom="sucesso">
                  <CheckCircle2 size={14} /> Menor carga neste cenário
                </Selo>
              )}
              {c.pending.length > 0 && (
                <BlocoRecolhivel titulo={`${c.pending.length} informação(ões) necessária(s)`} classeDoConteudo="px-4 pb-3">
                  <ul className="list-disc space-y-1 pl-4 text-helper text-fg-secondary">
                    {c.pending.map((p, j) => (
                      <li key={j}>{p}</li>
                    ))}
                  </ul>
                </BlocoRecolhivel>
              )}
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-surface-2 p-3">
          <small className="text-micro text-fg-muted">Receita considerada</small>
          <b className="block tabular-nums text-fg">{resultado.fields.receita_bruta.value === null ? "—" : brl(resultado.revenue)}</b>
        </div>
        <div className="rounded-md bg-surface-2 p-3">
          <small className="text-micro text-fg-muted">Custos e despesas</small>
          <b className="block tabular-nums text-fg">{resultado.ready ? brl(resultado.costs) : "Em composição"}</b>
        </div>
        <div className="rounded-md bg-surface-2 p-3">
          <small className="text-micro text-fg-muted">Resultado de referência antes de IRPJ/CSLL</small>
          <b className="block tabular-nums text-fg">{resultado.ready ? brl(resultado.profit) : "Em composição"}</b>
        </div>
      </div>

      <p className={NOTA}>
        {estudo.base.payrollConfig.enabled
          ? "A folha detalhada calcula encargos conforme o cenário."
          : "Os encargos informados são mantidos nos quatro cenários. Para variar a folha por regime, configure o detalhamento."}{" "}
        O resultado de referência vem da DRE; não é uma previsão de lucro líquido para cada regime.
      </p>
      <BlocoRecolhivel titulo="Ver alcance do cálculo" classeDoConteudo="px-4 pb-3">
        <p className={TEXTO_DE_APOIO}>
          Simulação com motor anual parametrizado. Sublimites e tratamentos não modelados mantêm o cenário fora do comparativo. Não
          calcula IRPJ trimestral nem compensação automática de prejuízos. IBS/CBS são hipóteses configuráveis. Dados fiscais
          documentais não se convertem automaticamente em receita ou crédito elegível.
        </p>
      </BlocoRecolhivel>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => irPara("relatorio")}>
          <FileText size={17} /> Preparar relatório
        </Button>
        <Button variant="secondary" onClick={() => irPara("premissas")}>
          <SlidersHorizontal size={17} /> Ajustar premissas
        </Button>
      </div>
    </section>
  );
}
