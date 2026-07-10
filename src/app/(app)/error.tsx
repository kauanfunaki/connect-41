"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Error boundary compartilhado por todas as rotas autenticadas (antes só
// /home tinha um próprio) — evita a tela branca genérica do Next quando uma
// Server Component lança um erro não tratado.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <div className="p-6 max-w-[1440px] mx-auto">
      <div className="bg-surface border border-border rounded-2xl p-10 flex flex-col items-center text-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
          <AlertTriangle size={18} />
        </span>
        <p className="text-[14px] font-semibold text-fg">Algo deu errado nesta página.</p>
        <p className="text-[13px] text-fg-muted max-w-[360px]">
          Tente novamente — se persistir, os outros módulos continuam acessíveis pela barra lateral.
        </p>
        <button
          type="button"
          onClick={reset}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors mt-1"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
