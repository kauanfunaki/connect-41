// A finalidade da NF-e (`ide/finNFe`) e as notas de crédito e de débito da
// reforma tributária (funcionalidade-793, 19/11/2026).
//
// Puro, sem banco: vale igual no upload, no SPED local, na sincronização com o
// Omie, nas telas e na IA.
//
// Desde o Ajuste SINIEF 49/25 (NT 2025.002-RTC, vigência 03/08/2026) o leiaute
// tem duas finalidades novas, além das quatro de sempre:
//   1 normal · 2 complementar · 3 ajuste · 4 devolução/retorno ·
//   5 nota de crédito · 6 nota de débito.
// As duas novas ajustam **só o IBS e a CBS** de uma operação anterior — a SEFAZ
// recusa nota 5/6 com outro tributo. A de débito é sempre de saída; a de crédito
// é de entrada. O motivo vem em `ide/tpNFDebito` ou `ide/tpNFCredito`, e a nota
// ajustada em `ide/NFref/refNFe`.
//
// Por isso uma nota 5/6 **não é faturamento nem compra**: não entra no total de
// entradas/saídas, nem na apuração de ICMS/IPI/PIS/COFINS, nem vira conta a
// pagar/receber (os juros e as reduções já estão nas duplicatas da nota
// original — lançar de novo duplicaria). Ela é informada à parte, como ajuste
// de IBS/CBS.

export const FINALIDADES = ["1", "2", "3", "4", "5", "6"] as const;
export type FinalidadeNfe = (typeof FINALIDADES)[number];

export function ehFinalidade(v: unknown): v is FinalidadeNfe {
  return typeof v === "string" && (FINALIDADES as readonly string[]).includes(v);
}

/** Como a tela escreve a finalidade. "Normal" quase nunca aparece: só no filtro. */
export const FINALIDADE_LABEL: Record<FinalidadeNfe, string> = {
  "1": "Normal",
  "2": "Complementar",
  "3": "Ajuste",
  "4": "Devolução",
  "5": "Nota de crédito",
  "6": "Nota de débito",
};

/**
 * A variante do `Badge` da finalidade (é categoria do documento, como o tipo —
 * regra do Selo/Badge de 08/10/2026). Crédito e débito em azul, porque são as
 * que ficam fora do financeiro; as outras, neutras. A cor nunca vai sozinha: o
 * texto diz a finalidade.
 */
export const FINALIDADE_VARIANTE: Record<FinalidadeNfe, "info" | "neutral"> = {
  "1": "neutral",
  "2": "neutral",
  "3": "neutral",
  "4": "neutral",
  "5": "info",
  "6": "info",
};

/** A finalidade que a tela destaca: todas menos a normal (e a que não se sabe). */
export function finalidadeEmDestaque(finalidade: string | null | undefined): FinalidadeNfe | null {
  return ehFinalidade(finalidade) && finalidade !== "1" ? finalidade : null;
}

/** Nota de crédito ou de débito: ajusta só IBS/CBS e fica fora do faturamento e do financeiro. */
export function ajustaSoIbsCbs(finalidade: string | null | undefined): boolean {
  return finalidade === "5" || finalidade === "6";
}

/**
 * Motivo da nota de débito (`ide/tpNFDebito`), conforme o leiaute da NT
 * 2025.002-RTC (TTpNFDebito, conferido no XSD de 19/11/2026).
 */
export const MOTIVO_NOTA_DE_DEBITO: Record<string, string> = {
  "01": "Transferência de créditos para cooperativas",
  "02": "Anulação de crédito por saídas imunes ou isentas",
  "03": "Débitos de notas fiscais não processadas na apuração",
  "04": "Multa e juros",
  "05": "Transferência de crédito na sucessão",
  "06": "Pagamento antecipado",
  "07": "Perda em estoque",
  "08": "Desenquadramento do Simples Nacional",
};

/**
 * Motivo da nota de crédito (`ide/tpNFCredito`). O XSD de 19/11/2026 vai até 05;
 * o 06 (recusa parcial) veio numa versão posterior da NT 2025.002-RTC e fica
 * aceito para a nota que já sair com ele.
 */
export const MOTIVO_NOTA_DE_CREDITO: Record<string, string> = {
  "01": "Multa e juros",
  "02": "Crédito presumido de IBS na Zona Franca de Manaus",
  "03": "Retorno por recusa na entrega ou destinatário não localizado",
  "04": "Redução de valores",
  "05": "Transferência de crédito na sucessão",
  "06": "Retorno por recusa parcial na entrega",
};

/** O motivo por extenso. Código desconhecido aparece como veio, para não sumir. */
export function motivoDoAjuste(finalidade: string | null | undefined, tipoAjuste: string | null | undefined): string | null {
  if (!ajustaSoIbsCbs(finalidade) || !tipoAjuste) return null;
  const mapa = finalidade === "5" ? MOTIVO_NOTA_DE_CREDITO : MOTIVO_NOTA_DE_DEBITO;
  return mapa[tipoAjuste] ?? `Código ${tipoAjuste}`;
}

/** O motivo gravado em `ignoredReason` quando a nota 5/6 entra no acervo. */
export const MOTIVO_FORA_DO_FINANCEIRO = "Nota de crédito/débito: ajusta IBS/CBS da nota referenciada, não gera conta";

/** O que a leitura de uma NF-e diz sobre a finalidade — o recorte de `DocumentoFiscalExtraido`. */
export type FinalidadeLida = {
  finalidade?: FinalidadeNfe | null;
  tipoAjuste?: string | null;
  chavesReferenciadas?: string[];
  valorIbs?: string | null;
  valorCbs?: string | null;
};

/**
 * As colunas do acervo (`FiscalDocument`) para a finalidade lida, já com o
 * destino: nota 5/6 nasce `IGNORADO`, com o motivo, fora da fila de lançamento.
 * As outras finalidades não mexem no destino (fica o padrão `PENDENTE`).
 *
 * Só para **criar** a linha: na atualização o destino é decisão de alguém e
 * não se sobrescreve.
 */
export function colunasDaFinalidade(lida: FinalidadeLida) {
  const finalidade = lida.finalidade ?? null;
  const colunas = {
    finalidade,
    tipoAjuste: ajustaSoIbsCbs(finalidade) ? (lida.tipoAjuste ?? null) : null,
    chavesReferenciadas: lida.chavesReferenciadas?.length ? lida.chavesReferenciadas.join(",") : null,
    valorIbs: lida.valorIbs ?? null,
    valorCbs: lida.valorCbs ?? null,
  };
  return ajustaSoIbsCbs(finalidade)
    ? { ...colunas, destination: "IGNORADO" as const, ignoredReason: MOTIVO_FORA_DO_FINANCEIRO }
    : colunas;
}

/** A coluna `chavesReferenciadas` ("chave,chave") de volta em lista. */
export function chavesReferenciadasDaColuna(coluna: string | null | undefined): string[] {
  return (coluna ?? "").split(",").filter((c) => /^\d{44}$/.test(c));
}

/** A chave de acesso em grupos de quatro, como no DANFE. */
export function chaveFormatada(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * O `where` que deixa de fora as notas 5/6. Escrito com `OR` e `null` de
 * propósito: `NOT IN` em SQL descarta a linha com a coluna nula, e nula é toda
 * nota anterior à coluna (e toda NFS-e e CT-e).
 */
export const SEM_AJUSTE_IBS_CBS = { OR: [{ finalidade: null }, { finalidade: { notIn: ["5", "6"] } }] };

/** O `where` do filtro por finalidade do acervo. "Normal" inclui a nota sem a marca. */
export function whereDaFinalidade(finalidade: FinalidadeNfe) {
  return finalidade === "1" ? { OR: [{ finalidade: null }, { finalidade: "1" }] } : { finalidade };
}
