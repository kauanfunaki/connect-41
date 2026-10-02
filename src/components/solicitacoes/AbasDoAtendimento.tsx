import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";

/**
 * O canal com o cliente, na mesma tela do menu Geral (01/10): o que o cliente
 * pede à 41, o que a 41 pede a um cliente e o que ela avisa a vários de uma vez.
 *
 * Aba, e não pílula (02/10): cada uma troca a tela — a regra de 30/09.
 */
export function AbasDoAtendimento({ ativa }: { ativa: "solicitacoes" | "pedidos" | "comunicados" }) {
  return (
    <AbasDeLink
      ativa={ativa}
      abas={[
        { chave: "solicitacoes", rotulo: "Solicitações dos clientes", href: "/solicitacoes" },
        { chave: "pedidos", rotulo: "Pedidos ao cliente", href: "/solicitacoes/pedidos" },
        { chave: "comunicados", rotulo: "Comunicados", href: "/solicitacoes/comunicados" },
      ]}
    />
  );
}
