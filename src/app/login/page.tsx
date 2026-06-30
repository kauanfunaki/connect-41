"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[360px]">

        {/* Marca */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-[6px] text-on-brand text-sm font-semibold"
              style={{ background: "var(--c41-brand-600)" }}
            >
              41
            </span>
            <span className="text-fg font-semibold text-[15px] tracking-[-0.01em]">Connect 41</span>
          </div>
          <p className="text-fg-muted text-[13px] mt-3">
            Acesse sua conta para continuar
          </p>
        </div>

        {/* Formulário via Server Action */}
        <form action={formAction} className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium text-fg">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="voce@41contabil.com.br"
              className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-[14px] text-fg placeholder:text-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium text-fg">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-[14px] text-fg placeholder:text-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {state?.error && (
            <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-9 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-100 mt-1"
          >
            {isPending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="text-center text-[12px] text-fg-muted mt-6">
          Connect 41 · Uso interno 41 Tech
        </p>
      </div>
    </div>
  );
}
