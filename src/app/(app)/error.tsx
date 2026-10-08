"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { AlertTriangle } from "lucide-react";
import { ErroDeVersaoAntiga } from "@/components/shell/AvisoDeVersaoNova";
import { ehVersaoAntiga } from "@/lib/versaoNova";

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

  if (ehVersaoAntiga(error)) return <ErroDeVersaoAntiga />;

  // A linguagem do vazio (`EmptyState`, tom de erro) dentro do `PageContainer`
  // e de um `Card` (07/10/2026): era um cartão próprio, com a largura da página
  // copiada à mão e o `font-medium` no Button, que não pegava.
  return (
    <PageContainer>
      <Card>
        <EmptyState
          tom="erro"
          icon={<AlertTriangle />}
          title="Algo deu errado nesta página."
          description="Tente novamente — se persistir, os outros módulos continuam acessíveis pela barra lateral."
          action={
            <Button type="button" onClick={reset}>
              Tentar novamente
            </Button>
          }
        />
      </Card>
    </PageContainer>
  );
}
