"use client";

import { ErroPublico } from "@/components/publico/ErroPublico";

// Rota pública (página de carreiras/vaga de um tenant) — sem sidebar/shell.
// Cobre também a sub-rota [vagaId] aninhada, por herança do error boundary.
export default function CarreirasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroPublico
      error={error}
      reset={reset}
      rotulo="carreiras"
      texto="Não foi possível carregar esta página. Tente novamente em instantes."
    />
  );
}
