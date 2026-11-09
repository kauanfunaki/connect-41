// Porte de `src/core/texto.py` do Contábil Core.
//
// Existe porque os contadores relataram históricos com espaçamento e capitalização inconsistentes,
// que dependem de como o banco formatou o extrato ou de como a regra foi digitada.
// - `normalizarHistoricoContabil` formata só o texto contábil GERADO (histórico e descrição do
//   lançamento). Nunca o texto bruto do extrato, que fica intacto para auditoria.
// - `normalizarParaMatch` existe só para COMPARAR o extrato com a regra (feedback do escritório,
//   18/08/2026): uma regra "TARIFA" precisa reconhecer "TARIFA COM LIQUIDAÇÃO". Nada disto é gravado
//   no lugar do texto original.

import { combinante, split } from "./unicodePy";

const SEM_TEXTO = "(sem texto)";

/** Colapsa espaços (inclusive tab e quebra de linha) e põe em maiúsculas. */
export function normalizarHistoricoContabil(texto: string): string {
  return split(texto).join(" ").toUpperCase();
}

/** Tira os diacríticos: 'LIQUIDAÇÃO' → 'LIQUIDACAO'. */
export function removerAcentos(texto: string): string {
  let out = "";
  for (const c of texto.normalize("NFKD")) if (!combinante(c)) out += c;
  return out;
}

/**
 * Forma canônica de comparação: minúsculas, sem acento, sem pontuação e com espaços colapsados.
 * 'TARIFA  COM/LIQUIDAÇÃO' e 'tarifa com liquidacao' viram a mesma coisa. A pontuação vira espaço
 * (não some) para 'TARIFA-BANCARIA' continuar sendo duas palavras.
 */
export function normalizarParaMatch(texto: string): string {
  const semAcento = removerAcentos(texto).toLowerCase();
  return split(semAcento.replace(/[^a-z0-9]+/g, " ")).join(" ");
}

/** As palavras da forma canônica, na ordem em que aparecem. */
export function tokensParaMatch(texto: string): string[] {
  return split(normalizarParaMatch(texto));
}

/**
 * O padrão estável que agrupa históricos bancários na fila do NEO. Números e palavras de uma letra
 * saem porque variam entre extratos sem mudar a natureza do lançamento (alguns bancos põem uma letra
 * solta no meio do histórico). Histórico sem nenhuma palavra útil fica sob uma chave própria: a
 * transação ainda exige trabalho do contador.
 */
export function chaveAgrupamentoHistorico(texto: string, quantidadeTokens: number): string {
  if (quantidadeTokens < 1) throw new RangeError("quantidade_tokens deve ser maior ou igual a 1");
  // Os tokens já são só [a-z0-9]: "numérico" do Python aqui é só dígito ASCII.
  const significativos = tokensParaMatch(texto).filter((t) => !/^[0-9]+$/.test(t) && t.length > 1);
  if (!significativos.length) return SEM_TEXTO;
  return significativos.slice(0, quantidadeTokens).join(" ");
}
