import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { SITUACAO_PARA_CLIENTE, VARIANTE_PARA_CLIENTE, type SituacaoParaCliente } from "@/lib/societario/portal";

/**
 * A situação do processo como o cliente a vê, no `Selo` — a situação de uma
 * linha é o selo miúdo, não a etiqueta (escolha 2A do Kauan, 08/10/2026). Era
 * o `Badge` na lista, no detalhe e no Início do portal.
 *
 * Cancelado e indeferido saem em cinza pelo próprio mapa do Societário
 * (`VARIANTE_PARA_CLIENTE`).
 */
export function SeloDoProcesso({ situacao }: { situacao: SituacaoParaCliente }) {
  return (
    <Selo tom={tomDaVariante(VARIANTE_PARA_CLIENTE[situacao])}>
      {SITUACAO_PARA_CLIENTE[situacao].rotulo}
    </Selo>
  );
}
