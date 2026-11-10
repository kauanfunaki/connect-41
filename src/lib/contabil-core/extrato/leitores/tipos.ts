// O contrato de um leitor de extrato por banco (porte de `extrato/bancos/__init__.py`).
//
// Cada leitor diz que siglas de agência atende, reconhece o layout pelo texto e extrai de um de dois
// jeitos: pelas linhas de texto (`extrair`) ou pelas palavras com posição (`extrairDePalavras`),
// para layout de colunas em que o texto já sai embaralhado. Quem escolhe o leitor é a sigla
// cadastrada na agência; o `reconhece` vale quando a sigla falta e para conferir o arquivo.

import type { Bloco, Palavra, Transacao } from "../comum";

export type Leitor = {
  /** O nome do módulo no original ("bb", "itau"…), que aparece nas recusas em maiúsculas. */
  nome: string;
  siglas: ReadonlySet<string>;
  reconhece(linhas: readonly string[]): boolean;
  extrair?(linhas: readonly string[], referenciaAno: number): Bloco[];
  extrairDePalavras?(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[];
  /** As palavras precisam vir com os caracteres (`extract_words(return_chars=True)`). */
  requerCaracteres?: boolean;
  /** Tira os lançamentos repetidos entre seções sobrepostas, depois da conferência dos blocos. */
  consolidarBlocos?(blocos: readonly Bloco[]): Transacao[];
};
