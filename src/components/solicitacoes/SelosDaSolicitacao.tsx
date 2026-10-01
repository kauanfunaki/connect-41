import { Badge } from "@/components/ui/Badge";
import {
  ROTULO_DA_RESPOSTA,
  ROTULO_PARA_CLIENTE,
  ROTULO_PARA_EQUIPE,
  type SituacaoDaResposta,
  type StatusDaSolicitacao,
} from "@/lib/solicitacoes/regras";

// A cor diz de quem é a vez para quem está olhando: do lado da equipe, a nova
// é o que a fila precisa destacar; do lado do cliente, é o "aguardando você".
const DA_EQUIPE: Record<StatusDaSolicitacao, "success" | "warning" | "danger" | "info"> = {
  ABERTA: "warning",
  EM_ANDAMENTO: "info",
  AGUARDANDO_CLIENTE: "info",
  CONCLUIDA: "success",
  CANCELADA: "danger",
};
const DO_CLIENTE: Record<StatusDaSolicitacao, "success" | "warning" | "danger" | "info"> = {
  ABERTA: "info",
  EM_ANDAMENTO: "info",
  AGUARDANDO_CLIENTE: "warning",
  CONCLUIDA: "success",
  CANCELADA: "danger",
};

export function SeloDaSolicitacao({ status, lado }: { status: StatusDaSolicitacao; lado: "EQUIPE" | "CLIENTE" }) {
  return lado === "EQUIPE" ? (
    <Badge variant={DA_EQUIPE[status]}>{ROTULO_PARA_EQUIPE[status]}</Badge>
  ) : (
    <Badge variant={DO_CLIENTE[status]}>{ROTULO_PARA_CLIENTE[status]}</Badge>
  );
}

/** Só quando o prazo aperta — respondida, encerrada e no prazo não ganham selo. */
export function SeloDoPrazoDeResposta({ situacao }: { situacao: SituacaoDaResposta }) {
  if (situacao !== "ATRASADA" && situacao !== "VENCE_HOJE") return null;
  return <Badge variant={situacao === "ATRASADA" ? "danger" : "warning"}>{ROTULO_DA_RESPOSTA[situacao]}</Badge>;
}
