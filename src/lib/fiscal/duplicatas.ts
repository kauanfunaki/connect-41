// As duplicatas da NF-e — `<cobr><dup>` (nDup, dVenc, vDup) — como o acervo
// as guarda (status "parado #22", 23/10/2026).
//
// Chegam por dois caminhos, no mesmo formato: o upload do XML, lido em
// `xml.ts`, e o índice do SPED, que passou a mandá-las no campo `duplicatas`
// da listagem (motor, docs/API-INTEGRACAO-DUPLICATAS.md). O formato é o do
// motor de propósito — `[{ numero, vencimento, valor }]`, valor em string de
// duas casas —, para a coluna `FiscalDocument.installments` não precisar
// saber de onde a nota veio.
//
// O que a conta a pagar faz com elas mora em
// src/lib/financeiro/parcelasDaNota.ts. Aqui é só ler e conferir.

import { dataValida } from "@/lib/financeiro/periodo";

/** Uma duplicata como viaja e como fica gravada. */
export type DuplicataDaNota = {
  /** `nDup`; nulo quando a nota não numera (e no pagamento à vista). */
  numero: string | null;
  /** "AAAA-MM-DD". */
  vencimento: string;
  /** Decimal em string, "1234.50" — dinheiro não passa por float. */
  valor: string;
};

/** A duplicata pronta para conta: vencimento conferido e valor em centavos. */
export type Duplicata = { numero: string | null; vencimentoKey: string; centavos: number };

/** O leiaute admite até 120 duplicatas por nota. */
export const MAXIMO_DE_DUPLICATAS = 120;

const RE_VALOR = /^\d{1,13}(\.\d{1,2})?$/;

/** "1234.5" → 123450. `null` no que não é valor de NF-e (vírgula, sinal, três casas). */
export function centavosDaDuplicata(valor: unknown): number | null {
  if (typeof valor !== "string" || !RE_VALOR.test(valor.trim())) return null;
  const [inteira, decimal = ""] = valor.trim().split(".");
  const centavos = Number(inteira) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/**
 * Lê uma lista de duplicatas — do JSON gravado, do payload do SPED ou do que
 * o XML deu.
 *
 * **Tudo ou nada**: uma duplicata com data ou valor ilegível devolve `null`, e
 * não "as que deu para ler". Uma parcela a menos é uma conta que soma menos
 * que a nota, e ninguém saberia que faltou uma. `[]` é lista lida e vazia; o
 * que não é lista também é `null`.
 */
export function lerDuplicatas(bruto: unknown): Duplicata[] | null {
  if (!Array.isArray(bruto)) return null;
  if (bruto.length > MAXIMO_DE_DUPLICATAS) return null;
  const lidas: Duplicata[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) return null;
    const d = item as Record<string, unknown>;
    const vencimentoKey = typeof d.vencimento === "string" ? dataValida(d.vencimento) : null;
    const centavos = centavosDaDuplicata(d.valor);
    if (!vencimentoKey || centavos === null || centavos <= 0) return null;
    const numero = typeof d.numero === "string" && d.numero.trim() ? d.numero.trim().slice(0, 60) : null;
    lidas.push({ numero, vencimentoKey, centavos });
  }
  return lidas;
}

/**
 * O que o índice do SPED mandou, pronto para gravar.
 *
 * `undefined` quando o campo não veio — motor anterior ao campo: a coluna fica
 * como está. `null` quando veio `null` (o motor não leu) ou ilegível: também
 * não se grava, porque "não sei" não apaga o que já se sabia. Só lista
 * conferida vira coluna, e no formato do contrato.
 */
export function duplicatasParaGravar(bruto: unknown): DuplicataDaNota[] | null | undefined {
  if (bruto === undefined) return undefined;
  const lidas = lerDuplicatas(bruto);
  if (!lidas) return null;
  return lidas.map((d) => ({
    numero: d.numero,
    vencimento: d.vencimentoKey,
    valor: `${Math.trunc(d.centavos / 100)}.${String(d.centavos % 100).padStart(2, "0")}`,
  }));
}
