import { Badge } from "@/components/ui/Badge";
import {
  ROTULO_DO_PRAZO,
  ROTULO_DO_STATUS,
  emAndamento,
  type SituacaoDoPrazo,
  type StatusDaPendencia,
} from "@/lib/financeiro/pendencias/regras";

// ABERTA é `warning` do lado da equipe porque espera alguém de fora; RESPONDIDA
// é `info` porque a vez é da equipe — é o que a fila precisa destacar.
const VARIANTE_DO_STATUS: Record<StatusDaPendencia, "success" | "warning" | "danger" | "info"> = {
  ABERTA: "warning",
  RESPONDIDA: "info",
  RESOLVIDA: "success",
  CANCELADA: "danger",
};

/** Rótulo do status para quem vê. No portal, "aguardando cliente" é "aguardando você". */
export function SeloDoStatus({ status, lado }: { status: StatusDaPendencia; lado: "EQUIPE" | "CLIENTE" }) {
  const rotulo =
    lado === "CLIENTE" && status === "ABERTA"
      ? "Aguardando você"
      : lado === "CLIENTE" && status === "RESPONDIDA"
        ? "Com a equipe"
        : ROTULO_DO_STATUS[status];
  return <Badge variant={VARIANTE_DO_STATUS[status]}>{rotulo}</Badge>;
}

/** Selo do prazo — só enquanto a pendência está em andamento; encerrada não vence. */
export function SeloDoPrazo({ situacao, status }: { situacao: SituacaoDoPrazo; status: StatusDaPendencia }) {
  if (!emAndamento(status) || situacao === "SEM_PRAZO" || situacao === "NO_PRAZO") return null;
  return <Badge variant={situacao === "VENCIDA" ? "danger" : "warning"}>{ROTULO_DO_PRAZO[situacao]}</Badge>;
}
