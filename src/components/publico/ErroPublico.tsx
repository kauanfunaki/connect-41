"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TelaDeAvisoPublica } from "./TelaDeAvisoPublica";

/**
 * O miolo dos `error.tsx` das rotas públicas (admissão, teste e carreiras),
 * que eram três cópias quase iguais (07/10/2026, auditoria DRG-28). Sem
 * sidebar nem shell: quem abre é o candidato, de fora do Connect.
 */
export function ErroPublico({
  error,
  reset,
  rotulo,
  texto,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Prefixo do log no console: "[admissao]", "[teste]"… */
  rotulo: string;
  texto: string;
}) {
  useEffect(() => {
    console.error(`[${rotulo}]`, error);
  }, [error, rotulo]);

  return (
    <TelaDeAvisoPublica titulo="Algo deu errado" texto={texto} icone={<AlertTriangle />} tom="perigo">
      <Button type="button" onClick={reset} className="mt-1">
        Tentar novamente
      </Button>
    </TelaDeAvisoPublica>
  );
}
