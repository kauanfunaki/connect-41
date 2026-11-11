import "server-only";

// O Razão em PDF no servidor (Bloco B, 11/11/2026): o texto de cada página como o `extract_text()`
// do pdfplumber, que o `razao.py` original lê. `razao.ts` e `apoio.ts` são puros e recebem esta
// função; aqui ficam os atalhos que já a passam.

import { caracteresDoPdf } from "../pdf/caracteres";
import { extrairTexto } from "../pdf/plumber";
import { lerRazaoApoio, type OpcoesApoio } from "./apoio";
import { lerRazao } from "./razao";
import type { RazaoApoio, RazaoConta } from "./razaoTipos";

/** O texto de cada página (`page.extract_text()`), sem limite de páginas, como no original. */
export async function textoDasPaginas(conteudo: Uint8Array): Promise<string[]> {
  const paginas = await caracteresDoPdf(conteudo);
  return paginas.map((p) => extrairTexto(p.caracteres));
}

/** `ler_razao` com o leitor de PDF do servidor. */
export function lerRazaoDoArquivo(conteudo: Uint8Array, nomeArquivo = ""): Promise<RazaoConta> {
  return lerRazao(conteudo, nomeArquivo, textoDasPaginas);
}

/** `ler_razao_apoio` com o leitor de PDF do servidor. */
export function lerRazaoApoioDoArquivo(conteudo: Uint8Array, nome = "", opcoes: Omit<OpcoesApoio, "textoDoPdf"> = {}): Promise<RazaoApoio> {
  return lerRazaoApoio(conteudo, nome, { ...opcoes, textoDoPdf: textoDasPaginas });
}
