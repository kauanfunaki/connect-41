import { Selo, tomDaVariante } from "@/components/ui/Selo";
import {
  ROTULO_DA_RESPOSTA,
  ROTULO_PARA_CLIENTE,
  ROTULO_PARA_EQUIPE,
  type SituacaoDaResposta,
  type StatusDaSolicitacao,
} from "@/lib/solicitacoes/regras";

// A cor diz de quem é a vez para quem está olhando: do lado da equipe, a nova
// é o que a fila precisa destacar; do lado do cliente, é o "aguardando você".
// A cancelada não é a vez de ninguém: neutra (07/10/2026), o `neutral` do Badge.
// Situação de linha é Selo, não Badge (escolha 2A, 08/10/2026): os mapas seguem
// na variante do Badge e passam pelo `tomDaVariante`.
const DA_EQUIPE: Record<StatusDaSolicitacao, "success" | "warning" | "danger" | "info" | "neutral"> = {
  ABERTA: "warning",
  EM_ANDAMENTO: "info",
  AGUARDANDO_CLIENTE: "info",
  CONCLUIDA: "success",
  CANCELADA: "neutral",
};
const DO_CLIENTE: Record<StatusDaSolicitacao, "success" | "warning" | "danger" | "info" | "neutral"> = {
  ABERTA: "info",
  EM_ANDAMENTO: "info",
  AGUARDANDO_CLIENTE: "warning",
  CONCLUIDA: "success",
  CANCELADA: "neutral",
};

export function SeloDaSolicitacao({ status, lado }: { status: StatusDaSolicitacao; lado: "EQUIPE" | "CLIENTE" }) {
  return lado === "EQUIPE" ? (
    <Selo tom={tomDaVariante(DA_EQUIPE[status])}>{ROTULO_PARA_EQUIPE[status]}</Selo>
  ) : (
    <Selo tom={tomDaVariante(DO_CLIENTE[status])}>{ROTULO_PARA_CLIENTE[status]}</Selo>
  );
}

/** Só quando o prazo aperta — respondida, encerrada e no prazo não ganham selo. */
export function SeloDoPrazoDeResposta({ situacao }: { situacao: SituacaoDaResposta }) {
  if (situacao !== "ATRASADA" && situacao !== "VENCE_HOJE") return null;
  return <Selo tom={situacao === "ATRASADA" ? "perigo" : "atencao"}>{ROTULO_DA_RESPOSTA[situacao]}</Selo>;
}
