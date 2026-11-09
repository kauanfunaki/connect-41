import { Link2Off } from "lucide-react";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { BotaoDoNaoEncontrado } from "@/components/publico/BotaoDoNaoEncontrado";

/**
 * O link de pedido que não leva a lugar nenhum (09/11/2026): escritório ou
 * assunto que não existem, assunto inativo ou com o link desligado. Os casos
 * respondem igual de propósito (ver `destinoDoPedido`). Sem o 404 geral, que
 * mandava "Ir para o início" — o login da equipe — a quem nem é cliente.
 */
export default function PedidoNaoEncontrado() {
  return (
    <TelaDeAvisoPublica
      icone={<Link2Off />}
      titulo="Link de pedido indisponível"
      texto="Este link não existe ou o escritório deixou de receber pedidos por ele. Fale com o escritório pelos canais de sempre."
    >
      <BotaoDoNaoEncontrado />
    </TelaDeAvisoPublica>
  );
}
