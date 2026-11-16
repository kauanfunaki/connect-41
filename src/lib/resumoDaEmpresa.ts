import type { HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";
import { HANDOFF_PRIORITY_LABEL, HANDOFF_STATUS_LABEL } from "@/lib/handoffs";

/**
 * As linhas de transferência que o Resumo IA da ficha da empresa recebe.
 *
 * Até 16/11/2026 (bug-708) a linha ia com os valores do banco: o código do
 * setor ("bpo"), a situação ("NEW") e a prioridade ("MEDIUM"). A IA repetia
 * esses códigos no texto, e o resumo saía com "NEW em bpo; prioridade MEDIUM".
 * Aqui eles viram os nomes que a tela mostra: "BPO (nova)", "prioridade média".
 */

/** Devolve o nome do setor a partir do código. Quem chama monta com `sectorLabel`. */
export type RotuloDoSetor = (codigo: string) => string;

type ParteDaTransferencia = { sectorCode: string; status: HandoffSectorStatus };

/** "BPO (nova), Fiscal (resolvendo)": cada setor de destino com a situação da parte dele. */
export function destinosDaTransferencia(partes: ParteDaTransferencia[], rotulo: RotuloDoSetor): string {
  return partes.map((p) => `${rotulo(p.sectorCode)} (${HANDOFF_STATUS_LABEL[p.status].toLowerCase()})`).join(", ");
}

export function linhaDaTransferencia(
  t: { data: string; de: string; partes: ParteDaTransferencia[]; prioridade: HandoffPriority; resumo: string | null },
  rotulo: RotuloDoSetor,
): string {
  const destinos = destinosDaTransferencia(t.partes, rotulo);
  const prioridade = HANDOFF_PRIORITY_LABEL[t.prioridade].toLowerCase();
  const resumo = t.resumo ? ` · "${t.resumo.slice(0, 160)}"` : "";
  return `[Transferência] ${t.data} — de ${rotulo(t.de)} para ${destinos || "nenhum setor"} · prioridade ${prioridade}${resumo}`;
}
