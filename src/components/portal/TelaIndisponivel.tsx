import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";

/**
 * A tela do portal que o escritório ainda não liberou (14/10/2026), aberta
 * pelo endereço direto: um favorito, o link de um e-mail ou de um aviso no
 * celular. Dentro da moldura, como o "não encontrado" do portal, e com a volta
 * para o Início.
 *
 * Não é 404: a tela existe, só não chegou a vez dela. E não mostra nada da
 * tela — quem a usa devolve este componente antes de consultar os dados.
 */
export function TelaIndisponivel() {
  return (
    <PageContainer>
      <Card>
        <EmptyState
          icon={<Hourglass />}
          title="Esta tela ainda não está disponível"
          description="O escritório está preparando esta parte do portal. Quando ela for liberada, aparece no menu."
          action={<Button href="/portal">Voltar ao início</Button>}
        />
      </Card>
    </PageContainer>
  );
}
