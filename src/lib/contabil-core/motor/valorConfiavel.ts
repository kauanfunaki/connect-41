// Porte de `src/domain/extrato/validacao.py` do Contábil Core: a barreira contra transação cujo
// valor não é confiável.
//
// O caso real (agosto/2026): um extrato em PDF caiu na camada de IA, que devolveu a linha inteira
// como descrição e pegou a coluna de SALDO no lugar do valor. Uma tarifa de R$ 1,19 a débito virou
// R$ 54.881,83 a crédito, em 29 transações.
//
// A régua é o próprio conteúdo da linha, e só vale quando o histórico ainda carrega dois ou mais
// valores monetários. Se o valor gravado é o último número, é o saldo; se não bate com nenhum, veio
// de lugar nenhum. Nos dois casos a transação não entra: importar com valor errado é silencioso e
// contamina o razão, enquanto a linha que falta aparece na conciliação.

import { decimal, fixo, igual, modulo, NAO_FINITO, type Dec } from "./decimal";
import { findall, rePy } from "./unicodePy";

/** Valor no formato brasileiro: 1.234,56 / -1,19 / 84.908,13. */
const MOEDA = rePy(String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`);
const DATA = rePy(String.raw`\b\d{2}/\d{2}/\d{4}\b`);

function paraDecimal(texto: string): Dec | null {
  const d = decimal(texto.replace(/\./g, "").replace(/,/g, "."));
  return d === NAO_FINITO ? null : d;
}

/** "R$ 1.234,56": a mensagem é lida por contador. */
export function reais(valor: Dec): string {
  const s = fixo(valor, 2);
  const ponto = s.indexOf(".");
  const inteiro = ponto < 0 ? s : s.slice(0, ponto);
  const centavos = ponto < 0 ? "" : s.slice(ponto + 1);
  // `int(inteiro)` perde o sinal de "-0", e `f"{n:,}"` separa milhar com vírgula.
  const n = BigInt(inteiro);
  const absoluto = (n < BigInt(0) ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${n < BigInt(0) ? "-" : ""}${absoluto},${centavos}`;
}

/** Os valores monetários do texto, em módulo e na ordem de leitura. */
export function valoresNaLinha(historico: string | null | undefined): Dec[] {
  const out: Dec[] = [];
  for (const m of findall(MOEDA, historico ?? "")) {
    const v = paraDecimal(m);
    if (v !== null) out.push(modulo(v));
  }
  return out;
}

/** Por que o valor não pode ser aceito, ou `null` se estiver ok. A frase vai para o contador. */
export function motivoValorNaoConfiavel(historico: string, valor: Dec): string | null {
  const numeros = valoresNaLinha(historico);
  // Descrição limpa (ou com um número só): nada a comparar.
  if (numeros.length < 2) return null;

  const gravado = modulo(valor);
  const primeiro = numeros[0];
  const ultimo = numeros[numeros.length - 1];

  if (igual(gravado, primeiro)) return null;
  if (igual(gravado, ultimo)) {
    return (
      `o valor lido (${reais(ultimo)}) é o último número da linha, que num ` +
      `extrato é o saldo da conta — o valor da transação parece ser ` +
      `${reais(primeiro)}`
    );
  }
  return `o valor lido (${reais(gravado)}) não corresponde a nenhum valor da linha do extrato`;
}

/**
 * Histórico que ainda tem data e mais de um valor: o leitor não separou a linha. Não é motivo para
 * recusar (com o valor certo, só a descrição fica feia), mas o arquivo merece conferência.
 */
export function historicoPareceLinhaCrua(historico: string | null | undefined): boolean {
  DATA.lastIndex = 0;
  const temData = DATA.test(historico ?? "");
  return temData && valoresNaLinha(historico).length >= 2;
}
