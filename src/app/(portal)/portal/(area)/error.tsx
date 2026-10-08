"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { ehVersaoAntiga } from "@/lib/versaoNova";

/**
 * O erro de uma tela do portal (07/10/2026), dentro da moldura: a sidebar
 * continua à vista, e o cliente segue para as outras telas. Sem ele, um erro de
 * consulta derrubava a tela inteira com a página padrão do Next — e só o Início
 * protegia os próprios blocos.
 *
 * O desenho é o do erro da equipe (`(app)/error.tsx`). O "Tentar novamente"
 * usa o `unstable_retry`, que busca a tela de novo no servidor: o `reset` só
 * redesenharia o mesmo resultado, e quase todo erro daqui nasce na consulta.
 */
export default function ErroNoPortal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[portal]", error);
  }, [error]);

  // Aba aberta antes de um deploy: tentar de novo não resolve, só recarregar.
  if (ehVersaoAntiga(error)) {
    return (
      <PageContainer>
        <Card>
          <EmptyState
            icon={<RefreshCw />}
            title="O portal foi atualizado."
            description="Esta página ainda está na versão anterior. Recarregue para continuar."
            action={
              <Button type="button" onClick={() => window.location.reload()}>
                Recarregar a página
              </Button>
            }
          />
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Card>
        <EmptyState
          tom="erro"
          icon={<AlertTriangle />}
          title="Algo deu errado nesta página."
          description="Tente novamente. Se continuar, os outros itens do menu seguem funcionando."
          action={
            <Button type="button" onClick={() => unstable_retry()}>
              Tentar novamente
            </Button>
          }
        />
      </Card>
    </PageContainer>
  );
}
