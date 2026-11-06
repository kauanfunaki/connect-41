"use client";

// Revisão anual dos recolhimentos adicionais de uma atividade e a cópia dos
// parâmetros entre anos, do Planejamento tributário (05/11/2026). Porte de
// `components/fiscal/annual-review.tsx` do Connect Tributário: mesmos textos e
// regras; o Dialog virou o `Modal` do Connect.

import { useId, useState, type ComponentProps } from "react";
import { CalendarDays, Copy } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import {
  CABECALHO,
  CABECALHO_NUMERO,
  CELULA,
  CELULA_NUMERO,
  ROLAGEM_DA_TABELA,
  TABELA,
  TEXTO_DE_APOIO,
  TITULO_DO_PAINEL,
} from "@/components/tributario/estilos";
import type { ActivityAnnual } from "@/lib/tributario/motor/activities";
import {
  annualCopyDifferences,
  annualReview,
  copyAnnualParameters,
  type AnnualCopyScope,
} from "@/lib/tributario/motor/annual-review";
import { externalRegimes, type ExternalRegime } from "@/lib/tributario/motor/external-taxes";
import { years } from "@/lib/tributario/motor/fiscal";

/** O `money` do original: reais com centavos (o `brl` do motor arredonda para inteiro). */
const money = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O `<details open={...}>` do original: abre ou fecha quando a condição muda
 * (com um ano só na prévia, ele aparece aberto); no meio, quem decide é a pessoa.
 */
function Recolhivel({
  abrir,
  ...resto
}: Omit<ComponentProps<typeof BlocoRecolhivel>, "aberto" | "onAbertoChange" | "abertoInicial"> & { abrir: boolean }) {
  const [aberto, setAberto] = useState(abrir);
  const [antes, setAntes] = useState(abrir);
  if (abrir !== antes) {
    setAntes(abrir);
    setAberto(abrir);
  }
  return <BlocoRecolhivel {...resto} aberto={aberto} onAbertoChange={setAberto} />;
}

export function PanoramaAnualExterno({
  values,
  selected,
  onSelect,
}: {
  values: ActivityAnnual[];
  selected: number;
  onSelect: (year: number) => void;
}) {
  const pending = values.reduce((sum, v) => sum + annualReview(v).pending, 0);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`${TITULO_DO_PAINEL} flex items-center gap-2`}>
          <CalendarDays size={18} aria-hidden className="shrink-0 text-fg-muted" />
          Adicionais por ano
        </h3>
        <Selo tom={pending ? "atencao" : "neutro"}>
          {pending ? pending + " itens pendentes de conferência" : "Sem itens detalhados pendentes"}
        </Selo>
      </div>
      <p className={TEXTO_DE_APOIO}>
        Somente os recolhimentos adicionais desta atividade. Os demais tributos e a folha aparecem no comparativo da empresa.
      </p>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Ano</th>
              {Object.values(externalRegimes).map((label) => (
                <th className={CABECALHO_NUMERO} key={label}>
                  {label}
                </th>
              ))}
              <th className={CABECALHO}>Composição / conferência</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value, i) => {
              const r = annualReview(value);
              return (
                <tr key={years[i]} className={selected === years[i] ? "bg-surface-2" : undefined}>
                  <td className={CELULA}>
                    <Button
                      variant="link"
                      className={`text-ui ${selected === years[i] ? "underline" : ""}`.trim()}
                      aria-current={selected === years[i] ? "true" : undefined}
                      aria-label={"Editar parâmetros de " + years[i]}
                      onClick={() => onSelect(years[i])}
                    >
                      {years[i]}
                    </Button>
                  </td>
                  {(Object.keys(externalRegimes) as ExternalRegime[]).map((k) => (
                    <td className={CELULA_NUMERO} key={k}>
                      {money(r.amounts[k])}
                    </td>
                  ))}
                  <td className={CELULA}>
                    <span>{value.externalMode === "total" ? "Totais por regime" : r.items + " itens detalhados"}</span>
                    <div className={`text-helper ${r.pending ? "text-warning-fg" : "text-fg-secondary"}`}>
                      {value.externalMode === "total"
                        ? "Conferir na revisão da atividade"
                        : r.pending
                          ? r.pending + " pendentes"
                          : r.items
                            ? "Itens conferidos"
                            : "Sem itens cadastrados"}
                    </div>
                    {r.omitted > 0 && <div className={TEXTO_DE_APOIO}>{r.omitted} itens sem acréscimo</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={TEXTO_DE_APOIO}>Clique no ano para editar. A revisão da atividade e a cobertura do regime continuam necessárias.</p>
    </section>
  );
}

export function PreviaDaCopiaAnual({
  before,
  after,
  targets,
}: {
  before: ActivityAnnual[];
  after: ActivityAnnual[];
  targets: number[];
}) {
  return (
    <div className="space-y-2">
      {targets.map((index) => {
        const changes = annualCopyDifferences(before[index], after[index]),
          old = annualReview(before[index]),
          next = annualReview(after[index]);
        return (
          <Recolhivel
            key={index}
            abrir={targets.length === 1}
            classeDoConteudo="space-y-3 px-4 pb-4"
            titulo={
              <>
                {years[index]} · {changes.length ? changes.length + " alterações" : "Sem alteração de valores"}
              </>
            }
          >
            <div className={ROLAGEM_DA_TABELA}>
              <table className={TABELA}>
                <thead>
                  <tr>
                    <th className={CABECALHO}>Adicionais</th>
                    <th className={CABECALHO_NUMERO}>Antes</th>
                    <th className={CABECALHO_NUMERO}>Após a cópia</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(externalRegimes) as ExternalRegime[]).map((k) => (
                    <tr key={k}>
                      <td className={CELULA}>{externalRegimes[k]}</td>
                      <td className={CELULA_NUMERO}>{money(old.amounts[k])}</td>
                      <td className={CELULA_NUMERO}>{money(next.amounts[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {changes.length > 0 && (
              <div className={ROLAGEM_DA_TABELA}>
                <table className={TABELA}>
                  <thead>
                    <tr>
                      <th className={CABECALHO}>Parâmetro substituído</th>
                      <th className={CABECALHO}>Antes</th>
                      <th className={CABECALHO}>Depois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((change) => (
                      <tr key={change.label}>
                        <td className={CELULA}>{change.label}</td>
                        <td className={CELULA}>{change.before}</td>
                        <td className={CELULA}>{change.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Recolhivel>
        );
      })}
    </div>
  );
}

export function JanelaDeCopiaAnual({
  values,
  source,
  name,
  onApply,
}: {
  values: ActivityAnnual[];
  source: number;
  name: string;
  onApply: (values: ActivityAnnual[]) => void;
}) {
  const prefixo = useId();
  const [open, setOpen] = useState(false),
    [targets, setTargets] = useState<number[]>([]),
    [scope, setScope] = useState<AnnualCopyScope>("external");
  const preview = copyAnnualParameters(values, source, targets, scope);
  function show() {
    setTargets([]);
    setScope("external");
    setOpen(true);
  }
  return (
    <>
      <Button variant="secondary" onClick={show}>
        <Copy size={16} aria-hidden />
        Copiar para outros anos
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Copiar parâmetros de ${years[source]}`} maxWidth="max-w-3xl">
        <div className="space-y-4">
          <p className={TEXTO_DE_APOIO}>{name}. Escolha os anos e confira as substituições antes de aplicar.</p>
          <CampoForm label="O que copiar" htmlFor={`${prefixo}-escopo`}>
            <Select id={`${prefixo}-escopo`} value={scope} onChange={(e) => setScope(e.target.value as AnnualCopyScope)}>
              <option value="external">Somente recolhimentos adicionais</option>
              <option value="all">Todos os parâmetros anuais</option>
            </Select>
          </CampoForm>
          <p className={TEXTO_DE_APOIO}>
            {scope === "external"
              ? "Copia o modo, os totais manuais e todos os itens dos recolhimentos adicionais. DAS, CBS, IBS, ICMS e ISS permanecem como estão nos anos de destino."
              : "Copia DAS, parcela excluída, substituições de CBS/IBS e ICMS/ISS, modo, totais e itens dos adicionais."}
          </p>
          <fieldset>
            <legend className="mb-1.5 text-label font-medium text-fg">Anos que receberão os parâmetros</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {years.map((year, i) =>
                i === source ? null : (
                  <Checkbox
                    key={year}
                    id={`${prefixo}-ano-${year}`}
                    label={year}
                    checked={targets.includes(i)}
                    onChange={(e) =>
                      setTargets((v) => (e.target.checked ? [...v, i].sort((a, b) => a - b) : v.filter((x) => x !== i)))
                    }
                  />
                )
              )}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Button variant="link" className="text-ui" onClick={() => setTargets(years.map((_, i) => i).filter((i) => i !== source))}>
              Selecionar todos os destinos
            </Button>
            <Button variant="link" className="text-ui" onClick={() => setTargets([])}>
              Limpar seleção
            </Button>
          </div>
          {targets.length > 0 ? (
            <>
              <h3 className={TITULO_DO_PAINEL}>Prévia das substituições</h3>
              <PreviaDaCopiaAnual before={values} after={preview} targets={targets} />
              <Aviso tom="atencao">
                Os itens existentes nos destinos serão substituídos pelos itens da origem. A conferência desses itens será
                retirada. Valores não são adaptados à transição: revise cada ano após copiar.
              </Aviso>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-ui text-fg-muted">
              Selecione ao menos um ano para visualizar a prévia.
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!targets.length}
            onClick={() => {
              onApply(preview);
              setOpen(false);
            }}
          >
            Aplicar em {targets.length} {targets.length === 1 ? "ano" : "anos"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
