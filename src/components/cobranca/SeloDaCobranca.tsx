import type { VarianteDoBadge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO } from "@/components/financeiro/tomDaSituacao";
import {
  ROTULO_DA_SITUACAO,
  VARIANTE_DA_SITUACAO,
  ROTULO_DO_ACORDO,
  type SituacaoDeCobranca,
  type StatusDoAcordo,
} from "@/lib/financeiro/cobranca/regras";

// Situação de título e de acordo no `Selo` miúdo, e não no `Badge` (escolha
// 2A do Kauan, 08/10/2026): é a situação da linha, e o Badge fica para
// categoria. Vale para a fila, a ficha, os acordos e o portal.

/** A situação de cobrança de um título. Nada quando o título não está em cobrança. */
export function SeloDaCobranca({ situacao }: { situacao: SituacaoDeCobranca | null }) {
  if (!situacao) return null;
  return <Selo tom={tomDaVariante(VARIANTE_DA_SITUACAO[situacao])}>{ROTULO_DA_SITUACAO[situacao]}</Selo>;
}

// Desfeito é encerrado — os títulos voltaram ao que eram —, então neutro, como
// as outras situações que saíram de cena (era `warning`, a cor de quem espera).
const VARIANTE_DO_ACORDO: Record<StatusDoAcordo, VarianteDoBadge> = {
  ATIVO: "info",
  CUMPRIDO: "success",
  QUEBRADO: "danger",
  DESFEITO: TOM_DA_SITUACAO.DESFEITA,
};

export function SeloDoAcordo({ status }: { status: StatusDoAcordo }) {
  return <Selo tom={tomDaVariante(VARIANTE_DO_ACORDO[status])}>Acordo {ROTULO_DO_ACORDO[status].toLowerCase()}</Selo>;
}
