import { Badge } from "@/components/ui/Badge";
import {
  ROTULO_DA_SITUACAO,
  VARIANTE_DA_SITUACAO,
  ROTULO_DO_ACORDO,
  type SituacaoDeCobranca,
  type StatusDoAcordo,
} from "@/lib/financeiro/cobranca/regras";

/** A situação de cobrança de um título. Nada quando o título não está em cobrança. */
export function SeloDaCobranca({ situacao }: { situacao: SituacaoDeCobranca | null }) {
  if (!situacao) return null;
  return <Badge variant={VARIANTE_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO[situacao]}</Badge>;
}

const VARIANTE_DO_ACORDO: Record<StatusDoAcordo, "danger" | "warning" | "info" | "success"> = {
  ATIVO: "info",
  CUMPRIDO: "success",
  QUEBRADO: "danger",
  DESFEITO: "warning",
};

export function SeloDoAcordo({ status }: { status: StatusDoAcordo }) {
  return <Badge variant={VARIANTE_DO_ACORDO[status]}>Acordo {ROTULO_DO_ACORDO[status].toLowerCase()}</Badge>;
}
