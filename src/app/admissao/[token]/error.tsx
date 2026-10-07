"use client";

import { ErroPublico } from "@/components/publico/ErroPublico";

// Rota pública (link de admissão enviado ao candidato) — sem sidebar/shell
// pra "os outros módulos continuam acessíveis". O desenho é o mesmo do aviso
// de link inválido/expirado desta rota (`TelaDeAvisoPublica`).
export default function AdmissaoError({
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
      rotulo="admissao"
      texto="Não foi possível carregar esta página. Tente novamente ou entre em contato com quem enviou o link."
    />
  );
}
