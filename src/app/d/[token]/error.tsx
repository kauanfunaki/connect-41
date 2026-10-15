"use client";

import { ErroPublico } from "@/components/publico/ErroPublico";

// Rota pública (link de documento enviado ao cliente) — sem sidebar/shell.
// O desenho é o mesmo do aviso de link inválido/expirado desta rota
// (`TelaDeAvisoPublica`, 15/10/2026 — era uma cópia à mão).
export default function DocumentoError({
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
      rotulo="documento"
      texto="Não foi possível carregar este documento. Tente novamente ou entre em contato com quem enviou o link."
    />
  );
}
