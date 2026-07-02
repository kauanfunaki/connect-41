"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import type { PipelineEntityType } from "@/generated/prisma/enums";

type EntityOption = { id: string; name: string };

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  pipelineId: string;
  entityType: PipelineEntityType;
  entities: EntityOption[];
  cancelHref: string;
};

export function ItemForm({ action, pipelineId, entityType, entities, cancelHref }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="pipelineId" value={pipelineId} />
      <input type="hidden" name="entityType" value={entityType} />

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <Field label={entityType === "COMPANY" ? "Empresa *" : "Pessoa *"} htmlFor="entityId">
        <select id="entityId" name="entityId" required className={INPUT}>
          <option value="">Selecionar…</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Prazo" htmlFor="dueDate">
          <input id="dueDate" name="dueDate" type="date" className={INPUT} />
        </Field>
        <Field label="Prioridade" htmlFor="priority">
          <select id="priority" name="priority" defaultValue="0" className={INPUT}>
            <option value="0">Normal</option>
            <option value="1">Alta</option>
            <option value="2">Urgente</option>
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Adicionando…" : "Adicionar"}
        </button>
        <Link
          href={cancelHref}
          className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
