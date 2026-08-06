// Ponte entre o motor e as telas: carrega o contexto, calcula, e devolve num
// formato pronto pra UI. Usado tanto pela página de conferência (render) quanto
// pela action (snapshot no salvar) — daí viver aqui e não em nenhuma das duas.

import { carregarContextoRescisao } from "./loader";
import { calcularRescisao, type VerbaCalculada, type RescisaoCalculo } from "./calculo";
import { excedeTolerancia } from "./config";
import type { RescisaoConfigResolvida } from "./config";

export type ReferenciaRescisao = {
  calculo: RescisaoCalculo;
  config: RescisaoConfigResolvida;
};

/** Calcula a referência completa. Null quando a rescisão não existe/escopo. */
export async function calcularReferencia(
  tenantId: string,
  personId: string,
  terminationId: string
): Promise<ReferenciaRescisao | null> {
  const contexto = await carregarContextoRescisao({ tenantId, personId, terminationId });
  if (!contexto) return null;
  return {
    calculo: calcularRescisao(contexto.input, contexto.config.valores),
    config: contexto.config,
  };
}

/**
 * Snapshot de UM item, pra gravar no TerminationCheck. Best-effort: se o
 * cálculo falhar, a conferência do humano não pode ser bloqueada por isso —
 * grava sem snapshot em vez de recusar o salvamento.
 */
export async function calcularSnapshotItem(
  tenantId: string,
  personId: string,
  terminationId: string,
  itemKey: string
): Promise<{
  calculatedValue: number | null;
  calculationBasis: string | null;
  calculationVersion: string | null;
  calculatedAt: Date | null;
}> {
  const vazio = {
    calculatedValue: null,
    calculationBasis: null,
    calculationVersion: null,
    calculatedAt: null,
  };

  try {
    const ref = await calcularReferencia(tenantId, personId, terminationId);
    const verba = ref?.calculo.verbas[itemKey];
    if (!ref || !verba) return vazio;

    return {
      calculatedValue: verba.valor,
      calculationBasis: descreverVerba(verba),
      calculationVersion: ref.calculo.motorVersao,
      calculatedAt: new Date(),
    };
  } catch (err) {
    console.error("[calcularSnapshotItem]", err);
    return vazio;
  }
}

/** Texto congelado no snapshot — precisa se sustentar sozinho no futuro. */
export function descreverVerba(verba: VerbaCalculada): string {
  const partes: string[] = [];
  if (verba.formula) partes.push(verba.formula);
  if (verba.motivo) partes.push(verba.motivo);
  if (verba.fundamento) partes.push(`Fundamento: ${verba.fundamento}`);
  if (verba.premissas.length > 0) partes.push(`Premissas: ${verba.premissas.join("; ")}`);
  partes.push(`Confiança: ${verba.confianca}`);
  return partes.join(" | ");
}

/** Divergência entre o informado e a referência, para destacar na linha. */
export function avaliarDivergencia(
  informado: number | null,
  verba: VerbaCalculada | undefined,
  toleranciaPct: number
): { divergente: boolean; delta: number | null } {
  if (informado == null || !verba || verba.situacao !== "CALCULADO" || verba.valor == null) {
    return { divergente: false, delta: null };
  }
  const delta = informado - verba.valor;
  return { divergente: excedeTolerancia(informado, verba.valor, toleranciaPct), delta };
}
