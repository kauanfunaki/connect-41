"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

// Rota pública (página de carreiras/vaga de um tenant) — sem sidebar/shell.
// Cobre também a sub-rota [vagaId] aninhada, por herança do error boundary.
export default function CarreirasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[carreiras]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-danger/10 text-danger flex items-center justify-center">
          <AlertTriangle size={18} />
        </span>
        <h1 className="text-[18px] font-semibold text-fg">Algo deu errado</h1>
        <p className="text-[13px] text-fg-muted">
          Não foi possível carregar esta página. Tente novamente em instantes.
        </p>
        <Button type="button" onClick={reset} className="mt-1">
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
