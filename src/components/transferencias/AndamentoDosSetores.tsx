import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { SinalDoSetor } from "@/components/transferencias/RotaDosSetores";
import { HANDOFF_PARADA_DIAS, HANDOFF_STATUS_LABEL } from "@/lib/handoffs";
import type { ResumoDaParte } from "@/lib/handoffAtividade";

export type ColunaDoAndamento = {
  id: string;
  setor: string;
  status: HandoffSectorStatus;
  resumo: ResumoDaParte;
  /** O setor de quem olha (ou a parte em que a pessoa é responsável): fundo de selecionado. */
  doMeuSetor: boolean;
};

const COR_DO_TEXTO: Record<ResumoDaParte["tom"], string> = {
  normal: "text-fg-muted",
  atencao: "text-warning-fg font-semibold",
  perigo: "text-danger",
};

/**
 * A faixa do topo da transferência aberta (10/11/2026, pedido do Kauan —
 * escolha "B · Andamento no topo e a conversa ao lado"): uma coluna por setor
 * de destino, com o sinal da situação e com quem está e desde quando, quem
 * finalizou e quando, ou o motivo da devolução. Responde "qual setor falta e
 * com quem" na primeira olhada. No celular as colunas viram linhas.
 */
export function AndamentoDosSetores({ colunas }: { colunas: ColunaDoAndamento[] }) {
  if (colunas.length === 0) return null;
  return (
    <Card as="section" aria-label="Andamento dos setores" className="overflow-hidden mb-5">
      <ol className="flex flex-col divide-y divide-border md:grid md:grid-flow-col md:auto-cols-fr md:divide-y-0 md:divide-x">
        {colunas.map((c) => (
          <li key={c.id} className={`flex min-w-0 flex-col gap-1.5 px-5 py-4 ${c.doMeuSetor ? "bg-selected-bg" : ""}`}>
            <span className="flex flex-wrap items-center gap-2 text-ui font-semibold text-fg">
              <span title={HANDOFF_STATUS_LABEL[c.status]} className="inline-flex">
                <SinalDoSetor status={c.status} tamanho={18} />
              </span>
              <span className="break-words">{c.setor}</span>
              <span className="sr-only">, {HANDOFF_STATUS_LABEL[c.status].toLowerCase()}</span>
              {c.doMeuSetor && <span className="text-helper font-normal text-fg-muted">· seu setor</span>}
            </span>
            <span className={`text-helper break-words ${COR_DO_TEXTO[c.resumo.tom]}`}>
              {c.resumo.texto}
              {c.resumo.parada && <span className="sr-only">. Parada: sem finalizar há {HANDOFF_PARADA_DIAS} dias ou mais.</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
