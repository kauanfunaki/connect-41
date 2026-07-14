"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { UsuarioState } from "@/app/(app)/admin/usuarios/actions";
import type { UserRole } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export type UsuarioDefaultValues = {
  id?: string;
  name?: string;
  email?: string;
  role?: UserRole;
  sectors?: string[];
  active?: boolean;
};

type Props = {
  action: (prev: UsuarioState, form: FormData) => Promise<UsuarioState>;
  cancelHref: string;
  roleOptions: { value: UserRole; label: string }[];
  sectorOptions: { value: string; label: string }[];
  defaultValues?: UsuarioDefaultValues;
  isSelf?: boolean;
};

export function UsuarioForm({ action, cancelHref, roleOptions, sectorOptions, defaultValues, isSelf }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);
  const selectedSectors = new Set(defaultValues?.sectors ?? []);
  // Campos <select>/<input> com `disabled` não são enviados no FormData — quando o próprio
  // usuário está editando seu registro, travamos as opções (papel único, ativo forçado) em
  // vez de desabilitar, para o valor continuar sendo submetido e bater com a regra do servidor.
  const roleOptionsForSelect =
    isSelf && defaultValues?.role
      ? roleOptions.filter((r) => r.value === defaultValues.role)
      : roleOptions;

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Nome" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Nome completo"
          />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaultValues?.email ?? ""}
            placeholder="nome@41contabil.com.br"
          />
        </CampoForm>
      </div>

      <CampoForm label={isEdit ? "Nova senha" : "Senha"} htmlFor="password" required={!isEdit}>
        <Input
          id="password"
          name="password"
          type="password"
          required={!isEdit}
          minLength={8}
          placeholder={isEdit ? "Deixe em branco para manter a atual" : "Mínimo 8 caracteres"}
        />
      </CampoForm>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm
          label="Papel"
          htmlFor="role"
          required
          helper={isSelf ? "Você não pode alterar seu próprio papel." : undefined}
        >
          <Select
            id="role"
            name="role"
            required
            defaultValue={defaultValues?.role ?? "SECTOR_USER"}
          >
            {roleOptionsForSelect.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </CampoForm>

        {isEdit && (
          <CampoForm label="Status" htmlFor="active">
            {isSelf ? (
              <>
                <input type="hidden" name="active" value="on" />
                <p className="h-9 flex items-center text-[13px] text-fg-muted">
                  Ativo (você não pode desativar sua própria conta)
                </p>
              </>
            ) : (
              <div className="h-9 flex items-center">
                <Checkbox
                  id="active"
                  name="active"
                  defaultChecked={defaultValues?.active ?? true}
                  label="Usuário ativo"
                />
              </div>
            )}
          </CampoForm>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[length:var(--fs-label)] font-medium text-fg">Setores</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {sectorOptions.map((s) => (
            <label
              key={s.value}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border text-[12px] text-fg-secondary hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <Checkbox
                name="sectors"
                value={s.value}
                defaultChecked={selectedSectors.has(s.value)}
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

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
