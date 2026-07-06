"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { BenefitCatalogState } from "@/app/(app)/empresas/[id]/beneficios/actions";
import { BenefitType } from "@/generated/prisma/enums";

const TYPE_LABEL: Record<BenefitType, string> = {
  VALE_REFEICAO:       "Vale-refeição",
  VALE_ALIMENTACAO:    "Vale-alimentação",
  VALE_TRANSPORTE:     "Vale-transporte",
  AUXILIO_COMBUSTIVEL: "Auxílio combustível",
  PLANO_SAUDE:         "Plano de saúde",
  PLANO_ODONTOLOGICO:  "Plano odontológico",
  CONVENIO_FARMACIA:   "Convênio farmácia",
  CONVENIO_SESC:       "Convênio SESC",
  TOTALPASS:           "TotalPass",
  AUXILIO_EDUCACAO:    "Auxílio educação",
  ASSIDUIDADE:         "Assiduidade",
  OUTRO:               "Outro",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as BenefitType[];

export type BenefitCatalogDefaultValues = {
  id?: string;
  name?: string;
  type?: BenefitType;
  eligibilityRule?: string;
};

type Props = {
  action: (prev: BenefitCatalogState, form: FormData) => Promise<BenefitCatalogState>;
  companyId: string;
  cancelHref: string;
  defaultValues?: BenefitCatalogDefaultValues;
};

export function BenefitCatalogForm({ action, companyId, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome *" htmlFor="name">
          <input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} className={INPUT} />
        </Field>
        <Field label="Tipo" htmlFor="type">
          <select id="type" name="type" defaultValue={defaultValues?.type ?? "OUTRO"} className={INPUT}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Regra de Elegibilidade" htmlFor="eligibilityRule">
        <textarea id="eligibilityRule" name="eligibilityRule" rows={2} defaultValue={defaultValues?.eligibilityRule ?? ""} className={INPUT} />
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
