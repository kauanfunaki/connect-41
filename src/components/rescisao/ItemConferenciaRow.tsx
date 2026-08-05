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

type Props = {
  item: RescisaoCheckItem;
  current: CheckState | null;
  action: (prev: ConferenciaState, form: FormData) => Promise<ConferenciaState>;
  canEdit: boolean;
};

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

export function ItemConferenciaRow({ item, current, action, canEdit }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CheckState["status"]>(current?.status ?? "PENDENTE");

  const efetivo = current?.status ?? "PENDENTE";

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
                defaultValue={current?.informedValue ?? ""}
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
              defaultValue={current?.note ?? ""}
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
