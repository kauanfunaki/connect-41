// Os artigos da base de conhecimento, juntos — ver `tipos.ts`.
//
// Escritos pelo Claude em 02/10/2026 lendo o código de cada tela, para a
// equipe revisar: o texto de um artigo é dado, e corrigir um passo é editar o
// arquivo do setor em `artigos/`.

import type { ArtigoDeAjuda } from "./tipos";
import { chaveDoCaminho, type ParDeCaminho } from "./caminho";
import { ARTIGOS_GERAIS } from "./artigos/geral";
import { ARTIGOS_FINANCEIROS } from "./artigos/financeiro";
import { ARTIGOS_PESSOAS_E_PROCESSOS } from "./artigos/pessoas-e-processos";

export const ARTIGOS: readonly ArtigoDeAjuda[] = [...ARTIGOS_GERAIS, ...ARTIGOS_FINANCEIROS, ...ARTIGOS_PESSOAS_E_PROCESSOS];

export function artigoDaChave(chave: string): ArtigoDeAjuda | null {
  return ARTIGOS.find((a) => a.chave === chave) ?? null;
}

/** Os pares que o "?" do topo usa no navegador. */
export const PARES_DE_CAMINHO: readonly ParDeCaminho[] = ARTIGOS.flatMap((a) => a.caminhos.map((caminho) => ({ caminho, chave: a.chave })));

export function artigoDoCaminho(pathname: string): ArtigoDeAjuda | null {
  const chave = chaveDoCaminho(pathname, PARES_DE_CAMINHO);
  return chave ? artigoDaChave(chave) : null;
}

/** O módulo que o artigo explica — nulo nas telas gerais (`geral:…`). */
export function moduloDoArtigo(a: ArtigoDeAjuda): string | null {
  return a.chave.startsWith("geral:") ? null : a.chave;
}
