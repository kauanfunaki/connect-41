// O registro dos leitores por banco (porte de `extrato/bancos/__init__.py`). A ordem é a do
// original: quando a sigla não decide, o primeiro leitor que reconhece o layout fica com o arquivo.

import { strip } from "../py";
import { bb } from "./bb";
import { bbc } from "./bbc";
import { bradesco } from "./bradesco";
import { c6 } from "./c6";
import { caixa } from "./caixa";
import { cora } from "./cora";
import { cresol } from "./cresol";
import { daycoval } from "./daycoval";
import { fitbank } from "./fitbank";
import { grafeno } from "./grafeno";
import { inter } from "./inter";
import { itau } from "./itau";
import { iugu } from "./iugu";
import { mercadopago } from "./mercadopago";
import { nubank } from "./nubank";
import { safra } from "./safra";
import { santander } from "./santander";
import { sicoob } from "./sicoob";
import { sicredi } from "./sicredi";
import { stone } from "./stone";
import { unicred } from "./unicred";
import { viacredi } from "./viacredi";
import type { Leitor } from "./tipos";

export type { Leitor } from "./tipos";

export const LEITORES: readonly Leitor[] = [
  bb, bbc, bradesco, c6, caixa, cora, cresol, daycoval, fitbank, grafeno, inter,
  itau, iugu, mercadopago, nubank, safra, santander, sicoob, sicredi, stone, unicred, viacredi,
];

/** `por_sigla`: o leitor da sigla cadastrada na agência. */
export function porSigla(bancoSigla: string | null): Leitor | null {
  if (!bancoSigla) return null;
  const alvo = strip(bancoSigla).toUpperCase();
  return LEITORES.find((l) => l.siglas.has(alvo)) ?? null;
}

/** `por_conteudo`: o primeiro leitor que reconhece o layout. */
export function porConteudo(linhas: readonly string[]): Leitor | null {
  return LEITORES.find((l) => l.reconhece(linhas)) ?? null;
}

/** `escolher`: a sigla manda; sem ela, o conteúdo. */
export function escolher(bancoSigla: string | null, linhas: readonly string[]): Leitor | null {
  return porSigla(bancoSigla) ?? porConteudo(linhas);
}
