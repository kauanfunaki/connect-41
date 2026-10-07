"use client";

import { ErroPublico } from "@/components/publico/ErroPublico";

// Rota pública (link de teste/avaliação enviado ao candidato) — sem
// sidebar/shell. O desenho é o mesmo do aviso de link inválido/expirado
// desta rota (`TelaDeAvisoPublica`).
export default function TesteError({
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
      rotulo="teste"
      texto="Não foi possível carregar este teste. Tente novamente ou entre em contato com quem enviou o link."
    />
  );
}
