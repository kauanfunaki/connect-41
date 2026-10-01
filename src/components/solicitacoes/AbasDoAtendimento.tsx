import { SegmentedControl } from "@/components/ui/SegmentedControl";

/**
 * O canal com o cliente, na mesma tela do menu Geral (01/10): o que o cliente
 * pede à 41, o que a 41 pede a um cliente e o que ela avisa a vários de uma vez.
 */
export function AbasDoAtendimento({ ativa }: { ativa: "solicitacoes" | "pedidos" | "comunicados" }) {
  return (
    <SegmentedControl
      label="Sentido do pedido"
      active={ativa}
      className="mb-4"
      items={[
        { key: "solicitacoes", label: "Solicitações dos clientes", href: "/solicitacoes" },
        { key: "pedidos", label: "Pedidos ao cliente", href: "/solicitacoes/pedidos" },
        { key: "comunicados", label: "Comunicados", href: "/solicitacoes/comunicados" },
      ]}
    />
  );
}
