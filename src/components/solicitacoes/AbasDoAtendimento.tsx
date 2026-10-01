import { SegmentedControl } from "@/components/ui/SegmentedControl";

/**
 * Os dois sentidos do canal com o cliente, na mesma tela do menu Geral (01/10):
 * o que o cliente pede à 41 e o que a 41 pede ao cliente.
 */
export function AbasDoAtendimento({ ativa }: { ativa: "solicitacoes" | "pedidos" }) {
  return (
    <SegmentedControl
      label="Sentido do pedido"
      active={ativa}
      className="mb-4"
      items={[
        { key: "solicitacoes", label: "Solicitações dos clientes", href: "/solicitacoes" },
        { key: "pedidos", label: "Pedidos ao cliente", href: "/solicitacoes/pedidos" },
      ]}
    />
  );
}
