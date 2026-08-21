"use client";

import { useActionState, useState } from "react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { ConferenciaState } from "@/app/(app)/pessoas/[id]/desligamento/[terminationId]/conferencia/actions";
import type { RescisaoCheckItem } from "@/lib/rescisaoChecklist";

export type CheckState = {
  status: "PENDENTE" | "CONFERIDO" | "DIVERGENTE" | "NAO_APLICAVEL";
  informedValue: string | null;
  note: string | null;
  checkedByName: string | null;
  checkedAtLabel: string | null;
};

/** Referência calculada pelo motor — opcional: itens de prazo/doc não têm. */
export type ReferenciaProps = {
  situacao: "CALCULADO" | "NAO_DEVIDA" | "NAO_CALCULAVEL" | "DESABILITADA_CONFIG";
  valor: number | null;
  valorLabel: string | null;
  formula: string | null;
  fundamento: string | null;
  motivo: string | null;
  premissas: string[];
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  /** Diferença informado − calculado, quando os dois existem. */
  delta: number | null;
  deltaLabel: string | null;
  divergente: boolean;
};

type Props = {
  item: RescisaoCheckItem;
  current: CheckState | null;
  referencia?: ReferenciaProps;
  action: (prev: ConferenciaState, form: FormData) => Promise<ConferenciaState>;
  canEdit: boolean;
};

const CONFIANCA_LABEL = {
  ALTA: "confiança alta",
  MEDIA: "confiança média",
  BAIXA: "confiança baixa",
} as const;

const STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "CONFERIDO", label: "Conferido" },
  { value: "DIVERGENTE", label: "Divergente" },
  { value: "NAO_APLICAVEL", label: "Não se aplica" },
] as const;

const STATUS_STYLE: Record<CheckState["status"], string> = {
  PENDENTE: "bg-surface-2 text-fg-muted border-border",
  CONFERIDO: "bg-success/10 text-success border-success/25",
  DIVERGENTE: "bg-danger/10 text-danger border-danger/25",
  NAO_APLICAVEL: "bg-surface-2 text-fg-secondary border-border",
};

const STATUS_LABEL: Record<CheckState["status"], string> = {
  PENDENTE: "Pendente",
  CONFERIDO: "Conferido",
  DIVERGENTE: "Divergente",
  NAO_APLICAVEL: "Não se aplica",
};

export function ItemConferenciaRow({ item, current, referencia, action, canEdit }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [open, setOpen] = useState(false);

  // Divergência só existe quando já há valor informado (veio de um salvamento
  // anterior). A sugestão vale enquanto ninguém tiver decidido o status —
  // depois disso, respeita o que o humano escolheu. É sugestão, não gravação:
  // nada persiste sem submit.
  const statusAtual = current?.status ?? "PENDENTE";
  const sugereDivergente = referencia?.divergente === true && statusAtual === "PENDENTE";
  const [status, setStatus] = useState<CheckState["status"]>(
    sugereDivergente ? "DIVERGENTE" : statusAtual
  );
  const [valorInformado, setValorInformado] = useState(current?.informedValue ?? "");

  const efetivo = statusAtual;

  const notaSugerida =
    sugereDivergente && referencia?.valorLabel && current?.informedValue
      ? `Informado R$ ${current.informedValue}; referência ${referencia.valorLabel}${
          referencia.deltaLabel ? ` (diferença de ${referencia.deltaLabel})` : ""
        }.`
      : "";

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-medium text-fg">{item.label}</p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[efetivo]}`}
            >
              {STATUS_LABEL[efetivo]}
            </span>
            {current?.informedValue && (
              <span className="text-[12px] text-fg-secondary tnum">R$ {current.informedValue}</span>
            )}

            {/* Referência do motor — sempre em tom mudo, pra nunca competir
                visualmente com o valor que a contabilidade informou. */}
            {referencia?.situacao === "CALCULADO" && referencia.valorLabel && (
              <span className="text-[12px] text-fg-muted tnum" title={referencia.formula ?? undefined}>
                ref. {referencia.valorLabel}
              </span>
            )}
            {referencia?.divergente && referencia.deltaLabel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-danger/10 text-danger border-danger/25 tnum">
                Δ {referencia.deltaLabel}
              </span>
            )}
            {referencia && referencia.situacao !== "CALCULADO" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-surface-2 text-fg-muted border-border">
                {referencia.situacao === "NAO_DEVIDA"
                  ? "não devida"
                  : referencia.situacao === "DESABILITADA_CONFIG"
                    ? "desabilitada"
                    : "sem referência"}
              </span>
            )}
          </div>
          {item.hint && <p className="text-[12px] text-fg-muted mt-0.5">{item.hint}</p>}
          {current?.note && <p className="text-[12px] text-fg-secondary mt-1 whitespace-pre-wrap">{current.note}</p>}
          {current?.checkedByName && current.checkedAtLabel && (
            <p className="text-[11px] text-fg-muted mt-1">
              Conferido por {current.checkedByName} em {current.checkedAtLabel}
            </p>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            {open ? "Fechar" : current ? "Editar" : "Conferir"}
          </button>
        )}
      </div>

      {/* Base do cálculo: o número sozinho é inauditável — o conferente
          precisa ver COMO chegou ali antes de aceitar ou contestar. */}
      {open && canEdit && referencia && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <p className="text-[12px] font-semibold text-fg">Base do cálculo de referência</p>
            <span className="text-[11px] text-fg-muted">{CONFIANCA_LABEL[referencia.confianca]}</span>
          </div>

          {referencia.formula ? (
            <p className="text-[12px] text-fg-secondary tnum">{referencia.formula}</p>
          ) : (
            <p className="text-[12px] text-fg-secondary">{referencia.motivo}</p>
          )}

          {referencia.fundamento && (
            <p className="text-[11px] text-fg-muted mt-1">Fundamento: {referencia.fundamento}</p>
          )}
          {referencia.premissas.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {referencia.premissas.map((p, i) => (
                <li key={i} className="text-[11px] text-fg-muted">
                  · {p}
                </li>
              ))}
            </ul>
          )}

          {referencia.situacao === "CALCULADO" && referencia.valorLabel && item.hasValue && (
            <button
              type="button"
              onClick={() => setValorInformado(referencia.valorLabel!.replace("R$ ", ""))}
              className="mt-2 text-[12px] text-brand hover:underline"
            >
              Usar {referencia.valorLabel} como valor informado
            </button>
          )}
        </div>
      )}

      {open && canEdit && (
        <form action={formAction} className="mt-3 grid grid-cols-1 sm:grid-cols-[160px_160px_1fr] gap-3 items-start">
          <div>
            <label htmlFor={`status-${item.key}`} className="block text-[11px] text-fg-muted mb-1">
              Situação
            </label>
            <Select
              id={`status-${item.key}`}
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CheckState["status"])}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {item.hasValue && (
            <div>
              <label htmlFor={`valor-${item.key}`} className="block text-[11px] text-fg-muted mb-1">
                Valor informado
              </label>
              <Input
                id={`valor-${item.key}`}
                name="informedValue"
                type="text"
                inputMode="decimal"
                value={valorInformado}
                onChange={(e) => setValorInformado(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <div className={item.hasValue ? "" : "sm:col-span-2"}>
            <label htmlFor={`note-${item.key}`} className="block text-[11px] text-fg-muted mb-1">
              Observação {status === "DIVERGENTE" && <span className="text-danger">(obrigatória)</span>}
            </label>
            <Textarea
              id={`note-${item.key}`}
              name="note"
              rows={2}
              defaultValue={current?.note ?? notaSugerida}
              maxLength={1000}
              placeholder={
                status === "DIVERGENTE" ? "O que divergiu e qual o valor esperado…" : "Anotação da conferência (opcional)"
              }
            />
          </div>

          <div className="sm:col-span-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar item"}
            </button>
            {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
