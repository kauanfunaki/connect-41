"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { VagaState } from "@/app/(app)/vagas/actions";
import { VagaPrioridade } from "@/generated/prisma/enums";

const PRIORITY_OPTIONS: { value: VagaPrioridade; label: string }[] = [
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA",  label: "Alta" },
];

export type VagaDefaultValues = {
  id?: string;
  title?: string;
  companyId?: string;
  sectorCode?: string;
  cargoId?: string;
  quantity?: number;
  responsibleUserId?: string;
  priority?: VagaPrioridade;
  notes?: string;
};

type Option = { id: string; name: string };
type CargoOption = { id: string; name: string; companyId: string };
type SectorOption = { value: string; label: string };

type Props = {
  action: (prev: VagaState, form: FormData) => Promise<VagaState>;
  cancelHref: string;
  companies: Option[];
  cargos: CargoOption[];
  users: Option[];
  sectorOptions: SectorOption[];
  defaultValues?: VagaDefaultValues;
};

export function VagaForm({ action, cancelHref, companies, cargos, users, sectorOptions, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [companyId, setCompanyId] = useState(defaultValues?.companyId ?? "");
  const cargosDaEmpresa = cargos.filter((c) => c.companyId === companyId);

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Título da Vaga *" htmlFor="title">
          <input id="title" name="title" type="text" required defaultValue={defaultValues?.title ?? ""} className={INPUT} />
        </Field>
        <Field label="Setor *" htmlFor="sectorCode">
          <select id="sectorCode" name="sectorCode" required defaultValue={defaultValues?.sectorCode ?? ""} className={INPUT}>
            <option value="">Selecione</option>
            {sectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Empresa *" htmlFor="companyId">
          <select
            id="companyId"
            name="companyId"
            required
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={INPUT}
          >
            <option value="">Selecione</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Cargo" htmlFor="cargoId">
          <select id="cargoId" name="cargoId" defaultValue={defaultValues?.cargoId ?? ""} disabled={!companyId} className={INPUT}>
            <option value="">{companyId ? "Nenhum" : "Selecione uma empresa"}</option>
            {cargosDaEmpresa.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Quantidade" htmlFor="quantity">
          <input id="quantity" name="quantity" type="number" min={1} defaultValue={defaultValues?.quantity ?? 1} className={INPUT} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Responsável" htmlFor="responsibleUserId">
          <select id="responsibleUserId" name="responsibleUserId" defaultValue={defaultValues?.responsibleUserId ?? ""} className={INPUT}>
            <option value="">Nenhum</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Prioridade" htmlFor="priority">
          <select id="priority" name="priority" defaultValue={defaultValues?.priority ?? "MEDIA"} className={INPUT}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Observações" htmlFor="notes">
        <textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} className={INPUT} />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <Link href={cancelHref} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">{label}</label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full px-3 py-2 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
