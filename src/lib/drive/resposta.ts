// A resposta de um arquivo do Drive, igual nas rotas da equipe e do portal.
//
// Baixar é sempre anexo. Abrir no navegador (`inline`) só vale para PDF e
// imagem — o resto (Word, planilha, XML, texto) baixa mesmo quando pedem para
// abrir, porque o navegador não mostra direito e um XML aberto inline é o
// primeiro passo para alguém tratar arquivo de cliente como página.
// `nosniff` em todos: o tipo é o conferido pelos bytes na entrada.

import { temPrevia } from "./servidor";

export function respostaDoArquivoDoDrive(
  conteudo: Buffer,
  arquivo: { name: string; mimeType: string },
  pediuParaAbrir: boolean
): Response {
  const inline = pediuParaAbrir && temPrevia(arquivo.mimeType, arquivo.name);
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": arquivo.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(arquivo.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
