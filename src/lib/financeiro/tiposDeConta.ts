// Os tipos de conta que não são banco (lote D, 20/10): o adiantamento e o
// cartão de crédito. Não têm extrato, não entram no saldo bancário nem na
// conciliação, e a baixa por eles não é dinheiro andando no fluxo de caixa.

import { TIPOS_DE_ADIANTAMENTO } from "./adiantamento";

export const CARTAO_DE_CREDITO = "CARTAO_CREDITO" as const;

export const TIPOS_FORA_DO_CAIXA = [...TIPOS_DE_ADIANTAMENTO, CARTAO_DE_CREDITO] as const;

/** A conta não é banco. A baixa sem conta (`null`) é caixa, como sempre foi. */
export function ehContaForaDoCaixa(tipo: string | null | undefined): boolean {
  return typeof tipo === "string" && (TIPOS_FORA_DO_CAIXA as readonly string[]).includes(tipo);
}

export function ehCartaoDeCredito(tipo: string | null | undefined): tipo is typeof CARTAO_DE_CREDITO {
  return tipo === CARTAO_DE_CREDITO;
}
