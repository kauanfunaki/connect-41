// CPF, CNPJ, e-mail e telefone dos dados fictícios do Recrutamento (14/10/2026).
//
// Não existe faixa oficial "de teste" para CPF ou CNPJ. As escolhas abaixo são
// as que não podem (ou quase não podem) ser de alguém de verdade:
//
// - **CNPJ com ordem 0000.** A ordem do estabelecimento começa em 0001 (a
//   matriz); 0000 nunca é emitida. Raiz 41.000.0NN, para ninguém confundir.
// - **CPF 000.410.0NN-DV.** Número-base baixíssimo, com o "41" no meio; os
//   dígitos verificadores são calculados, então o Connect aceita o número como
//   válido em qualquer tela.
// - **E-mail @exemplo.invalido.** `.invalido` não é domínio de topo: nada
//   enviado para lá chega a alguém.
// - **Telefone (41) 90000-00NN.** Celular no Brasil é 9 + o número antigo de 8
//   dígitos, que começava de 6 a 9; "9 0000" não foi distribuído a ninguém.
//
// O script confere, antes de gravar, que nenhum CPF ou CNPJ destes já existe
// no escritório.

/** Os dois dígitos verificadores de um CPF a partir dos 9 primeiros. */
function digitosDoCpf(base9: string): string {
  const dv = (parcial: string) => {
    let soma = 0;
    for (let i = 0; i < parcial.length; i++) soma += Number(parcial[i]) * (parcial.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base9);
  const d2 = dv(base9 + d1);
  return `${d1}${d2}`;
}

/** Os dois dígitos verificadores de um CNPJ a partir dos 12 primeiros. */
function digitosDoCnpj(base12: string): string {
  const dv = (parcial: string) => {
    const pesos = parcial.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < parcial.length; i++) soma += Number(parcial[i]) * pesos[i]!;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base12);
  const d2 = dv(base12 + d1);
  return `${d1}${d2}`;
}

/** O começo de todo CPF fictício: 000.410.0 — só os dois últimos da base variam. */
export const PREFIXO_DO_CPF = "0004100";

/** O n-ésimo CPF fictício (1 a 99), só dígitos. */
export function cpfFicticio(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(`CPF fictício fora da faixa: ${n}`);
  const base = `${PREFIXO_DO_CPF}${String(n).padStart(2, "0")}`;
  return base + digitosDoCpf(base);
}

/** A raiz de todo CNPJ fictício: 41.000.0 — e a ordem é sempre 0000. */
export const PREFIXO_DO_CNPJ = "4100000";
export const ORDEM_DO_CNPJ = "0000";

/** O n-ésimo CNPJ fictício (1 a 9), só dígitos: 41.000.00N/0000-DV. */
export function cnpjFicticio(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error(`CNPJ fictício fora da faixa: ${n}`);
  const base = `${PREFIXO_DO_CNPJ}${n}${ORDEM_DO_CNPJ}`;
  return base + digitosDoCnpj(base);
}

/** O domínio de todo e-mail fictício. */
export const DOMINIO_FICTICIO = "@exemplo.invalido";

/** "Ana Paula Ribeiro" → "ana.ribeiro@exemplo.invalido" (sem acento, minúsculo). */
export function emailFicticio(nome: string): string {
  const partes = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const local = partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}` : (partes[0] ?? "pessoa");
  return `${local}${DOMINIO_FICTICIO}`;
}

/** O n-ésimo telefone fictício (1 a 99): "(41) 90000-0001". */
export function telefoneFicticio(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(`Telefone fictício fora da faixa: ${n}`);
  return `(41) 90000-00${String(n).padStart(2, "0")}`;
}
