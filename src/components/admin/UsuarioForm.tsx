"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { UsuarioState } from "@/app/(app)/admin/usuarios/actions";
import type { UserRole } from "@/generated/prisma/enums";

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

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome *" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Nome completo"
            className={INPUT}
          />
        </Field>
        <Field label="E-mail *" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaultValues?.email ?? ""}
            placeholder="nome@41contabil.com.br"
            className={INPUT}
          />
        </Field>
      </div>

      <Field
        label={isEdit ? "Nova senha" : "Senha *"}
        htmlFor="password"
      >
        <input
          id="password"
          name="password"
          type="password"
          required={!isEdit}
          minLength={8}
          placeholder={isEdit ? "Deixe em branco para manter a atual" : "Mínimo 8 caracteres"}
          className={INPUT}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Papel *" htmlFor="role">
          <select
            id="role"
            name="role"
            required
            defaultValue={defaultValues?.role ?? "SECTOR_USER"}
            className={INPUT}
          >
            {roleOptionsForSelect.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {isSelf && (
            <p className="text-[11px] text-fg-muted mt-1">
              Você não pode alterar seu próprio papel.
            </p>
          )}
        </Field>

        {isEdit && (
          <Field label="Status" htmlFor="active">
            {isSelf ? (
              <>
                <input type="hidden" name="active" value="on" />
                <p className="h-9 flex items-center text-[13px] text-fg-muted">
                  Ativo (você não pode desativar sua própria conta)
                </p>
              </>
            ) : (
              <label className="flex items-center gap-2 h-9">
                <input
                  id="active"
                  name="active"
                  type="checkbox"
                  defaultChecked={defaultValues?.active ?? true}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-[13px] text-fg">Usuário ativo</span>
              </label>
            )}
          </Field>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[12px] font-medium text-fg">Setores</p>
        <div className="grid grid-cols-3 gap-2">
          {sectorOptions.map((s) => (
            <label
              key={s.value}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border text-[12px] text-fg-secondary hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                name="sectors"
                value={s.value}
                defaultChecked={selectedSectors.has(s.value)}
                className="w-3.5 h-3.5 rounded border-border"
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
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
