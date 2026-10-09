import { AbasDeLink } from "@/components/ui/AbasDeLink";

/**
 * O canal com o cliente, na mesma tela do menu Geral (01/10): o que o cliente
 * pede à 41, o que a 41 pede a um cliente, o que ela avisa a vários de uma vez
 * e, desde 08/10/2026, os documentos que ela manda a um cliente para ler e
 * aceitar (os "Envios", que moravam na ficha da empresa).
 *
 * Aba, e não pílula (02/10): cada uma troca a tela — a regra de 30/09.
 */
export function AbasDoAtendimento({ ativa }: { ativa: "solicitacoes" | "pedidos" | "comunicados" | "envios" }) {
  return (
    <AbasDeLink
      ativa={ativa}
      abas={[
        { chave: "solicitacoes", rotulo: "Solicitações dos clientes", href: "/solicitacoes" },
        { chave: "pedidos", rotulo: "Pedidos ao cliente", href: "/solicitacoes/pedidos" },
        { chave: "comunicados", rotulo: "Comunicados", href: "/solicitacoes/comunicados" },
        { chave: "envios", rotulo: "Envios", href: "/solicitacoes/envios" },
      ]}
    />
  );
}
