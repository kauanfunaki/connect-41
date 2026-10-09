import type { VarianteDoBadge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO } from "@/components/financeiro/tomDaSituacao";
import {
  ROTULO_DO_PRAZO,
  ROTULO_DO_STATUS,
  emAndamento,
  type SituacaoDoPrazo,
  type StatusDaPendencia,
} from "@/lib/financeiro/pendencias/regras";

// ABERTA é `warning` do lado da equipe porque espera alguém de fora; RESPONDIDA
// é `info` porque a vez é da equipe — é o que a fila precisa destacar.
// Cancelada no tom neutro do mapa único do BPO (08/10/2026): era `danger`, a
// cor de "Vencida" — encerrada não pede ação.
// No `Selo` miúdo, e não no `Badge` (escolha 2A, 08/10/2026): é a situação da
// linha. Vale para a fila da equipe, os pedidos e o portal.
const VARIANTE_DO_STATUS: Record<StatusDaPendencia, VarianteDoBadge> = {
  ABERTA: "warning",
  RESPONDIDA: "info",
  RESOLVIDA: "success",
  CANCELADA: TOM_DA_SITUACAO.CANCELADA,
};

/** Rótulo do status para quem vê. No portal, "aguardando cliente" é "aguardando você". */
export function SeloDoStatus({ status, lado }: { status: StatusDaPendencia; lado: "EQUIPE" | "CLIENTE" }) {
  const rotulo =
    lado === "CLIENTE" && status === "ABERTA"
      ? "Aguardando você"
      : lado === "CLIENTE" && status === "RESPONDIDA"
        ? "Com a equipe"
        : ROTULO_DO_STATUS[status];
  return <Selo tom={tomDaVariante(VARIANTE_DO_STATUS[status])}>{rotulo}</Selo>;
}

/** Selo do prazo — só enquanto a pendência está em andamento; encerrada não vence. */
export function SeloDoPrazo({ situacao, status }: { situacao: SituacaoDoPrazo; status: StatusDaPendencia }) {
  if (!emAndamento(status) || situacao === "SEM_PRAZO" || situacao === "NO_PRAZO") return null;
  return <Selo tom={situacao === "VENCIDA" ? "perigo" : "atencao"}>{ROTULO_DO_PRAZO[situacao]}</Selo>;
}
