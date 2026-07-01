"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthField, AUTH_INPUT } from "./AuthShell";
import { UserIcon, MailIcon, PhoneIcon, MessageIcon } from "./icons";

type ActionState = { error: string } | { success: true } | null;

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  showTelefone?: boolean;
  mensagemPlaceholder: string;
  submitLabel: string;
  submitLabelPending: string;
  successTitle: string;
  successMessage: string;
};

export function AccessRequestForm({
  action,
  showTelefone,
  mensagemPlaceholder,
  submitLabel,
  submitLabelPending,
  successTitle,
  successMessage,
}: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);

  if (state && "success" in state) {
    return (
      <div className="text-center py-2 space-y-3">
        <p className="text-[14px] font-semibold text-fg">{successTitle}</p>
        <p className="text-[13px] text-fg-muted leading-relaxed">{successMessage}</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors mt-2"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <AuthField label="Nome completo" htmlFor="nome" icon={<UserIcon />}>
        <input id="nome" name="nome" type="text" required placeholder="Seu nome" className={AUTH_INPUT} />
      </AuthField>

      <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="voce@41contabil.com.br"
          className={AUTH_INPUT}
        />
      </AuthField>

      {showTelefone && (
        <AuthField label="Telefone" htmlFor="telefone" icon={<PhoneIcon />}>
          <input id="telefone" name="telefone" type="tel" placeholder="(41) 99999-9999" className={AUTH_INPUT} />
        </AuthField>
      )}

      <AuthField label="Mensagem (opcional)" htmlFor="mensagem" icon={<MessageIcon />}>
        <input id="mensagem" name="mensagem" type="text" placeholder={mensagemPlaceholder} className={AUTH_INPUT} />
      </AuthField>

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-9 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover active:scale-[0.99] disabled:opacity-60 transition-all duration-100 mt-1"
      >
        {isPending ? submitLabelPending : submitLabel}
      </button>

      <p className="text-center text-[13px] text-fg-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
