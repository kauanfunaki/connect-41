"use client";

import { ErroPublico } from "@/components/publico/ErroPublico";

// Cobre login, esqueci-senha e redefinir-senha (todas aninhadas
// sob login/) — sem sidebar/shell, tela pública. No `ErroPublico` das outras
// rotas públicas (15/10/2026): era mais uma cópia à mão do mesmo aviso.
export default function LoginError({
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
      rotulo="login"
      texto="Não foi possível carregar esta página. Tente novamente em instantes."
    />
  );
}
