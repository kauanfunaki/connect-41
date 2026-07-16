"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PasswordField } from "./PasswordField";

type ActionState = { error: string } | { success: true } | null;

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  token: string;
};

export function RedefinirSenhaForm({ action, token }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);

  if (state && "success" in state) {
    return (
      <div className="text-center py-2 space-y-3">
        <p className="text-[14px] font-semibold text-fg">Senha redefinida</p>
        <p className="text-[13px] text-fg-muted leading-relaxed">
          Sua senha foi alterada. Todas as sessões ativas foram encerradas por segurança — entre novamente com a nova
          senha.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors mt-2"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <PasswordField label="Nova senha" autoComplete="new-password" />

      {/* PasswordField usa id/name fixos ("password") — o campo de confirmação
          precisa dos seus próprios, então não reaproveita o componente aqui. */}
      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="block text-[12px] font-medium text-fg">
          Confirmar nova senha
        </label>
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-canvas focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-colors">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••"
            className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
          />
        </div>
      </div>

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
        {isPending ? "Salvando…" : "Redefinir senha"}
      </button>

      <p className="text-center text-[13px] text-fg-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
