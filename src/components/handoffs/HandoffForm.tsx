"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { HandoffState } from "@/app/(app)/handoffs/actions";
import type { EntityType } from "@/generated/prisma/enums";
import { SECTOR_OPTIONS } from "@/lib/sectors";

type Props = {
  action: (prev: HandoffState, form: FormData) => Promise<HandoffState>;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  fromSectorOptions: { value: string; label: string }[];
  cancelHref: string;
};

export function HandoffForm({
  action,
  entityType,
  entityId,
  entityName,
  fromSectorOptions,
  cancelHref,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <p className="text-[11px] text-fg-muted mb-0.5">
          {entityType === "COMPANY" ? "Empresa" : "Pessoa"}
        </p>
        <p className="text-[14px] text-fg font-medium">{entityName}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Setor de origem *" htmlFor="fromSector">
          <select id="fromSector" name="fromSector" required className={INPUT}>
            <option value="">Selecionar…</option>
            {fromSectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Setor de destino *" htmlFor="toSector">
          <select id="toSector" name="toSector" required className={INPUT}>
            <option value="">Selecionar…</option>
            {SECTOR_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Mensagem" htmlFor="message">
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Contexto para quem vai receber o handoff…"
          className={`${INPUT} h-auto py-2 resize-none`}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Enviando…" : "Solicitar Handoff"}
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
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
