"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailRef.current?.value,
          password: passwordRef.current?.value,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao autenticar");
        return;
      }

      // Salva o access token e redireciona
      sessionStorage.setItem("access_token", data.accessToken);
      router.push("/");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[360px]">

        {/* Logotipo / marca */}
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

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-lg p-6 space-y-4"
        >
          {/* E-mail */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-[13px] font-medium text-fg"
            >
              E-mail
            </label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="voce@41contabil.com.br"
              className="
                w-full h-9 px-3 rounded-md border border-border bg-canvas
                text-[14px] text-fg placeholder:text-fg-muted
                outline-none transition-colors
                focus:border-brand focus:ring-2 focus:ring-brand/20
              "
            />
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-fg"
            >
              Senha
            </label>
            <input
              ref={passwordRef}
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="
                w-full h-9 px-3 rounded-md border border-border bg-canvas
                text-[14px] text-fg placeholder:text-fg-muted
                outline-none transition-colors
                focus:border-brand focus:ring-2 focus:ring-brand/20
              "
            />
          </div>

          {/* Erro */}
          {error && (
            <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {/* Botão */}
          <button
            type="submit"
            disabled={loading}
            className="
              w-full h-9 rounded-md bg-brand text-on-brand
              text-[14px] font-medium
              hover:bg-brand-hover active:scale-[0.99]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-100
              mt-1
            "
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="text-center text-[12px] text-fg-muted mt-6">
          Connect 41 · Uso interno 41 Tech
        </p>
      </div>
    </div>
  );
}
