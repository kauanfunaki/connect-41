"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PlanoDeContasState } from "@/app/(app)/admin/plano-de-contas/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export type FinanceCategoryDefaultValues = {
  id?: string;
  name?: string;
  kind?: "PAGAR" | "RECEBER";
  dreGroup?: string | null;
};

type Props = {
  action: (prev: PlanoDeContasState, form: FormData) => Promise<PlanoDeContasState>;
  cancelHref: string;
  defaultValues?: FinanceCategoryDefaultValues;
  /** Grupos de DRE já usados no tenant — vira sugestão, não lista fechada. */
  gruposExistentes?: string[];
};

export function FinanceCategoryForm({
  action,
  cancelHref,
  defaultValues,
  gruposExistentes = [],
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {!isEdit ? (
        <CampoForm label="Lado do plano" htmlFor="kind" required>
          <Select id="kind" name="kind" required defaultValue={defaultValues?.kind ?? ""}>
            <option value="">Selecionar…</option>
            <option value="PAGAR">Contas a pagar (despesa)</option>
            <option value="RECEBER">Contas a receber (receita)</option>
          </Select>
        </CampoForm>
      ) : (
        <p className="text-[12px] text-fg-muted">
          O lado do plano não pode ser alterado depois de criado — mudá-lo viraria o sinal de
          todo lançamento já classificado nesta categoria.
        </p>
      )}

      <CampoForm label="Nome da categoria" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
          placeholder="Ex: Fretes, Energia elétrica, Honorários…"
        />
      </CampoForm>

      <CampoForm label="Grupo do DRE" htmlFor="dreGroup">
        <Input
          id="dreGroup"
          name="dreGroup"
          type="text"
          list="grupos-dre"
          defaultValue={defaultValues?.dreGroup ?? ""}
          placeholder="Ex: Despesas operacionais"
        />
        <datalist id="grupos-dre">
          {gruposExistentes.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </CampoForm>
      <p className="text-[12px] text-fg-muted -mt-4">
        Opcional. É como a categoria aparece agrupada no DRE — o escritório monta o próprio, por
        isso é texto livre. Deixe em branco se ainda não decidiu.
      </p>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
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
