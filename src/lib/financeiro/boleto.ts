// Linha digitável e código de barras de boleto (19/10, lote H2). Funções puras.
//
// É a conferência da leitura pela IA: a IA lê o PDF inteiro, mas valor e
// vencimento de um boleto bancário estão também dentro da linha digitável,
// protegidos por dígito verificador. Quando a linha fecha, ela manda; quando
// não fecha, a tela marca o valor e o vencimento para a pessoa conferir. O
// número errado num boleto é o tipo de erro que a IA comete com a cara de
// trabalho feito.
//
// Dois leiautes da Febraban:
//
// - **Bancário** (cobrança): 47 dígitos na linha, 44 no código de barras.
//   Banco, moeda, DV geral (módulo 11), fator de vencimento, valor e 25 dígitos
//   de campo livre do banco. Cada um dos três primeiros campos da linha tem o
//   seu DV (módulo 10).
// - **Arrecadação** (concessionária e tributo): começa com 8, 48 dígitos na
//   linha (quatro blocos de 11 com DV cada), 44 no código de barras. O
//   vencimento não tem lugar fixo — cada órgão usa o campo livre do seu jeito —,
//   então dele só sai o valor.
//
// O fator de vencimento conta dias a partir de 07/10/1997 e chegou a 9999 em
// 21/02/2025; no dia seguinte voltou a 1000 (regra da Febraban). O mesmo fator
// vale para duas datas, a 9.000 dias uma da outra: fica a mais perto de hoje.

export type LinhaLida =
  | {
      ok: true;
      tipo: "bancario";
      banco: string;
      codigoDeBarras: string;
      linhaDigitavel: string;
      /** Nulo quando o boleto vem sem valor (o pagador digita). */
      valorCentavos: number | null;
      /** Nulo no fator 0000 (contra-apresentação). */
      vencimentoKey: string | null;
    }
  | {
      ok: true;
      tipo: "arrecadacao";
      codigoDeBarras: string;
      linhaDigitavel: string;
      /** Nulo quando o identificador diz que o valor é de referência, não em reais. */
      valorCentavos: number | null;
      vencimentoKey: null;
    }
  | { ok: false; erro: string };

const so = (s: string) => s.replace(/\D/g, "");

/** Módulo 10 (Febraban): pesos 2 e 1 da direita para a esquerda, soma dos algarismos dos produtos. */
export function dvModulo10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    const p = Number(numero[i]) * peso;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/** Soma do módulo 11: pesos 2 a 9 da direita para a esquerda, recomeçando em 2. */
function somaModulo11(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma;
}

/** DV geral do código de barras bancário: resto 0, 1 ou 10 dão 1. */
export function dvGeralBancario(numero43: string): number {
  const dv = 11 - (somaModulo11(numero43) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 11 da arrecadação: resto 0 ou 1 dá 0. */
export function dvModulo11Arrecadacao(numero: string): number {
  const resto = somaModulo11(numero) % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

const DIA = 86_400_000;
const BASE_ANTIGA = Date.UTC(1997, 9, 7); // fator 0 → 07/10/1997
const BASE_NOVA = Date.UTC(2025, 1, 22); // fator 1000 → 22/02/2025

const chave = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const instante = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

/** O vencimento do fator, na volta do ciclo mais perto de `hojeKey`. Nulo no fator 0000. */
export function vencimentoDoFator(fator: number, hojeKey: string): string | null {
  if (fator === 0) return null;
  const hoje = instante(hojeKey);
  const antiga = BASE_ANTIGA + fator * DIA;
  const nova = BASE_NOVA + (fator - 1000) * DIA;
  if (fator < 1000) return chave(nova); // abaixo de 1000 só existe no ciclo novo
  return Math.abs(nova - hoje) <= Math.abs(antiga - hoje) ? chave(nova) : chave(antiga);
}

function lerBancario(barras: string, linha: string, hojeKey: string): LinhaLida {
  const valor = Number(barras.slice(9, 19));
  return {
    ok: true,
    tipo: "bancario",
    banco: barras.slice(0, 3),
    codigoDeBarras: barras,
    linhaDigitavel: linha,
    valorCentavos: valor > 0 ? valor : null,
    vencimentoKey: vencimentoDoFator(Number(barras.slice(5, 9)), hojeKey),
  };
}

/** Linha bancária (47) → código de barras (44), conferindo os quatro DVs. */
function bancarioDaLinha(linha: string): { barras: string } | { erro: string } {
  const campos = [linha.slice(0, 10), linha.slice(10, 21), linha.slice(21, 32)];
  for (const [i, c] of campos.entries()) {
    if (dvModulo10(c.slice(0, -1)) !== Number(c.slice(-1))) return { erro: `O ${i + 1}º campo da linha digitável não fecha o dígito verificador.` };
  }
  const barras = linha.slice(0, 4) + linha[32] + linha.slice(33, 47) + linha.slice(4, 9) + linha.slice(10, 20) + linha.slice(21, 31);
  return conferirBarrasBancario(barras) ? { barras } : { erro: "O dígito verificador geral da linha digitável não fecha." };
}

function conferirBarrasBancario(barras: string): boolean {
  return dvGeralBancario(barras.slice(0, 4) + barras.slice(5)) === Number(barras[4]);
}

/** Código de barras bancário (44) → linha digitável (47). */
function linhaDoBancario(barras: string): string {
  const livre = barras.slice(19);
  const c1 = barras.slice(0, 4) + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return `${c1}${dvModulo10(c1)}${c2}${dvModulo10(c2)}${c3}${dvModulo10(c3)}${barras[4]}${barras.slice(5, 19)}`;
}

/** O módulo da arrecadação sai do 3º dígito: 6 e 7, módulo 10; 8 e 9, módulo 11. */
function dvDaArrecadacao(identificador: string): ((n: string) => number) | null {
  if (identificador === "6" || identificador === "7") return dvModulo10;
  if (identificador === "8" || identificador === "9") return dvModulo11Arrecadacao;
  return null;
}

function lerArrecadacao(barras: string, linha: string): LinhaLida {
  const dv = dvDaArrecadacao(barras[2]);
  if (!dv) return { ok: false, erro: "Código de arrecadação com identificador de valor desconhecido." };
  if (dv(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) return { ok: false, erro: "O dígito verificador geral do código de arrecadação não fecha." };
  // 6 e 8: valor efetivo em reais. 7 e 9: valor de referência (quantidade, moeda indexada).
  const efetivo = barras[2] === "6" || barras[2] === "8";
  const valor = Number(barras.slice(4, 15));
  return { ok: true, tipo: "arrecadacao", codigoDeBarras: barras, linhaDigitavel: linha, valorCentavos: efetivo && valor > 0 ? valor : null, vencimentoKey: null };
}

/**
 * Lê uma linha digitável (47 ou 48 dígitos) ou um código de barras (44), com ou
 * sem pontos e espaços. Só devolve `ok` com todos os dígitos verificadores
 * fechando.
 */
export function lerLinhaDigitavel(bruto: string, hojeKey: string): LinhaLida {
  const d = so(bruto);
  if (d.length === 47) {
    const r = bancarioDaLinha(d);
    return "erro" in r ? { ok: false, erro: r.erro } : lerBancario(r.barras, d, hojeKey);
  }
  if (d.length === 48) {
    if (d[0] !== "8") return { ok: false, erro: "Linha de 48 dígitos que não é de arrecadação." };
    const dv = dvDaArrecadacao(d[2]);
    if (!dv) return { ok: false, erro: "Código de arrecadação com identificador de valor desconhecido." };
    const blocos = [0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 12));
    for (const [i, b] of blocos.entries()) {
      if (dv(b.slice(0, 11)) !== Number(b[11])) return { ok: false, erro: `O ${i + 1}º bloco da linha digitável não fecha o dígito verificador.` };
    }
    return lerArrecadacao(blocos.map((b) => b.slice(0, 11)).join(""), d);
  }
  if (d.length === 44) {
    if (d[0] === "8") {
      const dv = dvDaArrecadacao(d[2]);
      if (!dv) return { ok: false, erro: "Código de arrecadação com identificador de valor desconhecido." };
      const linha = [0, 1, 2, 3].map((i) => d.slice(i * 11, i * 11 + 11)).map((b) => b + dv(b)).join("");
      return lerArrecadacao(d, linha);
    }
    if (!conferirBarrasBancario(d)) return { ok: false, erro: "O dígito verificador do código de barras não fecha." };
    return lerBancario(d, linhaDoBancario(d), hojeKey);
  }
  return { ok: false, erro: d.length === 0 ? "Sem linha digitável." : `A linha digitável tem ${d.length} dígitos; o boleto tem 47 (ou 48, de concessionária).` };
}

/** "00190000090123456789…" → "00190.00009 01234.567891 …", como vem impressa no boleto. */
export function formatarLinhaDigitavel(linha: string): string {
  const d = so(linha);
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  if (d.length === 48) return [0, 1, 2, 3].map((i) => `${d.slice(i * 12, i * 12 + 11)}-${d[i * 12 + 11]}`).join(" ");
  return d;
}
