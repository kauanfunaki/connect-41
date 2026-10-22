"use client";

import { useMemo, useState } from "react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useFeriados } from "@/components/ui/useFeriados";
import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { AJUSTES_DO_DIA, type AjusteDoDia } from "@/lib/financeiro/repeticao";
import { MAXIMO_DE_PARCELAS, ONDE_FICA_O_RESTO, propostaDeParcelas, type OndeFicaOResto } from "@/lib/financeiro/parcelamento";

const valorNoCampo = (centavos: number) => Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (key: string) => key.split("-").reverse().join("/");

/** O que a pessoa mudou à mão numa parcela. Some quando a divisão é refeita. */
type Ajustes = Record<number, { vencimento?: string; valor?: string }>;

/** "3× de R$ 333,33", "Não parcela". */
export function resumoDoParcelamento(parcelas: string, totalCentavos: number | null): string {
  const n = Number(parcelas);
  if (!Number.isInteger(n) || n < 2) return "Não parcela";
  return totalCentavos && totalCentavos >= n ? `${n}× de ${formatarReaisDeCentavos(Math.floor(totalCentavos / n))}` : `${n} parcelas`;
}

/**
 * "Parcelar" no lançamento manual (22/10/2026, o que faltava do levantamento
 * do mercado): o valor digitado é o total, dividido em N parcelas, uma por
 * mês a partir do vencimento. A tela mostra a divisão — os centavos que
 * sobram na primeira ou na última — e cada parcela tem o valor e o
 * vencimento editáveis antes de lançar; a soma tem de fechar com o total.
 * Mudar o valor, o vencimento, o número de parcelas ou onde fica o resto
 * refaz a divisão (e desfaz o que foi mudado à mão).
 *
 * Cada parcela vira uma conta, ligada às outras pela série ("3/12"), como a
 * repetição — mas não junto com ela, nem com rateio, retenção ou "já pago
 * em": o servidor recusa e diz o caminho.
 *
 * Vai no formulário como `parcelar`, `parcelas` (JSON com o vencimento e os
 * centavos de cada uma) e `parcelarAjuste`; quem confere é `lerParcelas`, no
 * servidor. O número de parcelas mora no formulário (`parcelas`/`onParcelas`)
 * para o rótulo do valor dizer "total".
 */
export function CamposDoParcelamento({
  parcelas,
  onParcelas,
  valorTexto,
  primeiroVencimento,
  className = "",
}: {
  parcelas: string;
  onParcelas: (v: string) => void;
  /** O valor do formulário, como digitado — o total a dividir. */
  valorTexto: string;
  /** O vencimento do formulário, "AAAA-MM-DD" — o da primeira parcela. */
  primeiroVencimento: string;
  className?: string;
}) {
  const [resto, setResto] = useState<OndeFicaOResto>("PRIMEIRA");
  const [ajuste, setAjuste] = useState<AjusteDoDia>("ADIAR");
  const mapaDeFeriados = useFeriados();
  const feriados = useMemo(() => new Set(mapaDeFeriados.keys()), [mapaDeFeriados]);

  const total = centavosDeTexto(valorTexto);
  const n = Number(parcelas);
  const parcelando = Number.isInteger(n) && n >= 2;
  const proposta = useMemo(
    () =>
      parcelando && total && /^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)
        ? propostaDeParcelas({ totalCentavos: total, parcelas: Math.min(n, MAXIMO_DE_PARCELAS), primeiroVencimentoKey: primeiroVencimento, resto, ajuste, feriados })
        : [],
    [parcelando, total, n, primeiroVencimento, resto, ajuste, feriados]
  );

  // Os ajustes à mão valem para a divisão em que foram feitos: a chave muda, e
  // eles somem sem precisar de efeito.
  const chave = `${total}|${n}|${primeiroVencimento}|${resto}|${ajuste}`;
  const [ajustes, setAjustes] = useState<{ chave: string; porParcela: Ajustes }>({ chave, porParcela: {} });
  const porParcela = ajustes.chave === chave ? ajustes.porParcela : {};
  const ajustar = (indice: number, campo: "vencimento" | "valor", v: string) =>
    setAjustes({ chave, porParcela: { ...porParcela, [indice]: { ...porParcela[indice], [campo]: v } } });

  const finais = proposta.map((p) => {
    const valor = porParcela[p.indice]?.valor ?? valorNoCampo(p.centavos);
    return { indice: p.indice, vencimento: porParcela[p.indice]?.vencimento ?? p.vencimentoKey, valor, centavos: centavosDeTexto(valor) };
  });
  const soma = finais.reduce((s, p) => s + (p.centavos ?? 0), 0);
  const diferenca = total !== null ? total - soma : 0;
  const json = JSON.stringify(finais.map((p) => ({ vencimento: p.vencimento, centavos: p.centavos ?? 0 })));

  return (
    <BlocoRecolhivel titulo="Parcelar" resumo={resumoDoParcelamento(parcelas, total)} className={`bg-surface ${className}`.trim()}>
      <div className="flex flex-col gap-3 pt-1">
        <input type="hidden" name="parcelar" value={parcelando ? "1" : "0"} />
        {parcelando && <input type="hidden" name="parcelas" value={json} />}
        <input type="hidden" name="parcelarAjuste" value={ajuste} />
        <FieldGrid columns="sm:grid-cols-3">
          <CampoForm label="Parcelas" htmlFor="lancamento-parcelas" helper="Em branco, não parcela.">
            <CampoNumero
              id="lancamento-parcelas"
              min={2}
              max={MAXIMO_DE_PARCELAS}
              value={parcelas}
              onChange={(e) => onParcelas(e.target.value)}
              placeholder="Não parcela"
            />
          </CampoForm>
          <CampoForm label="Centavos que sobram" htmlFor="lancamento-parcelas-resto">
            <Select id="lancamento-parcelas-resto" value={resto} onChange={(e) => setResto(e.target.value as OndeFicaOResto)} disabled={!parcelando}>
              {ONDE_FICA_O_RESTO.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Em fim de semana ou feriado" htmlFor="lancamento-parcelas-ajuste">
            <Select id="lancamento-parcelas-ajuste" value={ajuste} onChange={(e) => setAjuste(e.target.value as AjusteDoDia)} disabled={!parcelando}>
              {AJUSTES_DO_DIA.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
        </FieldGrid>

        {parcelando && n > MAXIMO_DE_PARCELAS && <p className="text-helper text-danger">No máximo {MAXIMO_DE_PARCELAS} parcelas.</p>}
        {parcelando && finais.length === 0 && n <= MAXIMO_DE_PARCELAS && (
          <p className="text-helper text-fg-muted">Preencha o valor total e o vencimento da primeira parcela para ver a divisão.</p>
        )}

        {finais.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-micro uppercase tracking-wide text-fg-muted">
              <span>Parcela</span>
              <span>Vencimento</span>
              <span>Valor</span>
            </div>
            <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {finais.map((p) => (
                <div key={p.indice} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                  <span className="text-fs-2 tabular-nums text-fg-secondary">
                    {p.indice}/{finais.length}
                  </span>
                  <CampoData
                    compact
                    value={p.vencimento}
                    onChange={(v) => ajustar(p.indice, "vencimento", v)}
                    aria-label={`Vencimento da parcela ${p.indice}`}
                    error={!p.vencimento}
                  />
                  <Input
                    compact
                    prefix="R$"
                    inputMode="decimal"
                    value={p.valor}
                    onChange={(e) => ajustar(p.indice, "valor", e.target.value)}
                    aria-label={`Valor da parcela ${p.indice}`}
                    error={!p.centavos}
                  />
                </div>
              ))}
            </div>
            <p className={`text-helper ${diferenca === 0 ? "text-fg-secondary" : "text-danger"}`}>
              {diferenca === 0
                ? `As ${finais.length} parcelas somam ${formatarReaisDeCentavos(soma)}, o total. A primeira vence em ${dataBr(finais[0]!.vencimento || primeiroVencimento)}.`
                : `As parcelas somam ${formatarReaisDeCentavos(soma)} — ${diferenca > 0 ? "faltam" : "sobram"} ${formatarReaisDeCentavos(Math.abs(diferenca))} para o total de ${formatarReaisDeCentavos(total ?? 0)}.`}
            </p>
          </div>
        )}

        <p className="text-helper text-fg-muted">
          {parcelando
            ? "Cada parcela vira uma conta em aberto, com a competência desta (a compra é uma só) e o mesmo número de documento, ligada às outras pela série (\"3/12\"). Cada uma se edita, paga e cancela sozinha, e \"Mudar daqui em diante\" muda as próximas de uma vez."
            : "Para uma compra ou um contrato dividido: o valor acima é o total, e cada parcela vira uma conta. Para a conta que se repete inteira todo mês (aluguel), use Repetir."}
        </p>
      </div>
    </BlocoRecolhivel>
  );
}
