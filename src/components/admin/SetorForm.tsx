"use client";

import { useActionState } from "react";
import type { SetorState } from "@/app/(app)/admin/setores/actions";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type SetorDefaultValues = {
  id?: string;
  code?: string;
  label?: string;
  color?: string;
  active?: boolean;
  order?: number;
};

type Props = {
  action: (prev: SetorState, form: FormData) => Promise<SetorState>;
  cancelHref: string;
  defaultValues?: SetorDefaultValues;
};

export function SetorForm({ action, cancelHref, defaultValues }: Props) {
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

      <FieldGrid>
        <CampoForm label="Nome do setor" htmlFor="label" required>
          <Input
            id="label"
            name="label"
            type="text"
            required
            defaultValue={defaultValues?.label ?? ""}
            placeholder="Ex: Trabalhista, Marketing…"
          />
        </CampoForm>

        {isEdit && defaultValues?.code && (
          <CampoForm
            label="Código"
            htmlFor="code"
            helper="Gerado a partir do nome na criação — não pode ser alterado (já é usado em kanban, usuários e transferências)."
          >
            <Input id="code" type="text" value={defaultValues.code} disabled className="font-mono" />
          </CampoForm>
        )}
      </FieldGrid>

      <fieldset>
        <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">Cor</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SECTOR_COLOR_PALETTE.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="colorRadio"
                value={c}
                aria-label={`Cor ${c}`}
                defaultChecked={(defaultValues?.color ?? SECTOR_COLOR_PALETTE[0]) === c}
                className="peer sr-only"
                onChange={(e) => {
                  const form = e.currentTarget.closest("form");
                  const colorInput = form?.querySelector<HTMLInputElement>('input[name="color"]');
                  if (colorInput) colorInput.value = c;
                }}
              />
              <span
                className="block w-7 h-7 rounded-full border-2 border-transparent peer-checked:border-fg transition-colors"
                style={{ background: c }}
              />
            </label>
          ))}
          <input type="hidden" name="color" defaultValue={defaultValues?.color ?? SECTOR_COLOR_PALETTE[0]} />
        </div>
      </fieldset>

      {/* Ordem é um número de um ou dois dígitos: coluna estreita. A caixa de
          "ativo" dispensa o rótulo "Status" em cima — o dela já diz tudo. */}
      {isEdit && (
        <FieldGrid columns="sm:grid-cols-[8rem_minmax(0,1fr)]">
          <CampoForm label="Ordem" htmlFor="order">
            <Input
              id="order"
              name="order"
              type="number"
              defaultValue={defaultValues?.order ?? 0}
            />
          </CampoForm>
          <AlinhadoAoCampo>
            <Checkbox
              id="active"
              name="active"
              defaultChecked={defaultValues?.active ?? true}
              label="Setor ativo"
            />
          </AlinhadoAoCampo>
        </FieldGrid>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button href={cancelHref} variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
