"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

// Rota pública (link de documento enviado ao cliente) — sem sidebar/shell.
// Mesmo layout centralizado que esta rota já usa pro estado de link
// inválido/expirado.
export default function DocumentoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[documento]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-danger/10 text-danger flex items-center justify-center">
          <AlertTriangle size={18} />
        </span>
        <h1 className="text-[18px] font-semibold text-fg">Algo deu errado</h1>
        <p className="text-[13px] text-fg-muted">
          Não foi possível carregar este documento. Tente novamente ou entre em contato com quem enviou o link.
        </p>
        <Button type="button" onClick={reset} className="mt-1">
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
