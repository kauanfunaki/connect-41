"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { HandoffState } from "@/app/(app)/transferencias/actions";
import type { EntityType } from "@/generated/prisma/enums";

type EntityOption = { id: string; name: string };

type FixedEntity = { entityType: EntityType; entityId: string; entityName: string };

type Props = {
  action: (prev: HandoffState, form: FormData) => Promise<HandoffState>;
  fromSectorOptions: { value: string; label: string }[];
  toSectorOptions: { value: string; label: string }[];
  cancelHref: string;
  fixedEntity?: FixedEntity;
  companies?: EntityOption[];
  people?: EntityOption[];
};

export function HandoffForm({
  action,
  fromSectorOptions,
  toSectorOptions,
  cancelHref,
  fixedEntity,
  companies = [],
  people = [],
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [entityType, setEntityType] = useState<EntityType>(fixedEntity?.entityType ?? "COMPANY");
  const entityOptions = entityType === "COMPANY" ? companies : people;

  return (
    <form action={formAction} className="space-y-6">
      {fixedEntity ? (
        <>
          <input type="hidden" name="entityType" value={fixedEntity.entityType} />
          <input type="hidden" name="entityId" value={fixedEntity.entityId} />
          <div>
            <p className="text-[10px] text-fg-muted mb-0.5">
              {fixedEntity.entityType === "COMPANY" ? "Empresa" : "Pessoa"}
            </p>
            <p className="text-[14px] text-fg font-medium">{fixedEntity.entityName}</p>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo *" htmlFor="entityType">
            <select
              id="entityType"
              name="entityType"
              required
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
              className={INPUT}
            >
              <option value="COMPANY">Empresa</option>
              <option value="PERSON">Pessoa</option>
            </select>
          </Field>
          <Field label={entityType === "COMPANY" ? "Empresa *" : "Pessoa *"} htmlFor="entityId">
            <select id="entityId" name="entityId" required defaultValue="" className={INPUT}>
              <option value="" disabled>Selecionar…</option>
              {entityOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            {entityOptions.length === 0 && (
              <p className="text-[11px] text-fg-muted mt-1">
                Nenhuma {entityType === "COMPANY" ? "empresa" : "pessoa"} disponível no seu escopo.
              </p>
            )}
          </Field>
        </div>
      )}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Setor de origem *" htmlFor="fromSector">
          <select id="fromSector" name="fromSector" required defaultValue="" className={INPUT}>
            <option value="" disabled>Selecionar…</option>
            {fromSectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Setor de destino *" htmlFor="toSector">
          <select id="toSector" name="toSector" required defaultValue="" className={INPUT}>
            <option value="" disabled>Selecionar…</option>
            {toSectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Mensagem" htmlFor="message">
        <textarea
          id="message"
          name="message"
          rows={2}
          placeholder="Resumo curto para quem vai receber o handoff…"
          className={`${INPUT} h-auto py-2 resize-none`}
        />
      </Field>

      <Field label="Descrição" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Detalhe o que motivou esta transferência, contexto adicional, pendências etc…"
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
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
