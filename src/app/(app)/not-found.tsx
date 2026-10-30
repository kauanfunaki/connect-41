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
//
// As telas sem permissão também caem aqui (a Administração, o robô do
// Societário, o Radar): o texto dizia só "não existe ou foi removido", e quem
// recebia um link não sabia que o caso era de acesso (auditoria de UX,
// 30/10/2026). Agora diz as duas coisas e o que fazer.
export default function AppNotFound() {
  return (
    <PageContainer>
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="Não deu para abrir esta página."
          description="Ela não existe, foi removida ou não está liberada para o seu usuário. Se alguém te mandou o link, peça a um administrador do Connect para conferir o seu acesso."
          action={<Button href="/home">Voltar ao início</Button>}
        />
      </Card>
    </PageContainer>
  );
}
