import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { FileQuestion } from "lucide-react";

// 404 dentro do shell autenticado — cobre notFound() disparado por
// ids/rotas inválidas dentro de (app) (ex: /empresas/xxxxx inexistente).
//
// Com o `EmptyState` dentro do `PageContainer` e de um `Card` (07/10/2026), a
// mesma linguagem do "não há nada aqui" do resto do app.
export default function AppNotFound() {
  return (
    <PageContainer>
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="Página não encontrada."
          description="O registro ou a rota que você tentou abrir não existe ou foi removido."
          action={<Button href="/home">Voltar ao início</Button>}
        />
      </Card>
    </PageContainer>
  );
}
