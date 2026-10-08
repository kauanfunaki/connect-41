import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";

/**
 * O "não encontrado" do portal (07/10/2026): o `notFound()` das telas do
 * cliente — o id que não é das empresas dele, a tela de um módulo desligado —
 * e o endereço que não existe dentro de /portal (ver `[...resto]`).
 *
 * Caía no 404 global, cujo botão leva a `/home`: a entrada da equipe, que o
 * cliente não tem como passar. Aqui o caminho de volta é o Início do portal, e
 * a tela fica dentro da moldura, com o menu à vista.
 */
export default function NaoEncontradoNoPortal() {
  return (
    <PageContainer>
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="Página não encontrada."
          description="O endereço não existe, ou o item não está mais disponível para as suas empresas."
          action={<Button href="/portal">Voltar ao Início</Button>}
        />
      </Card>
    </PageContainer>
  );
}
