// Os vídeos de passo a passo da ajuda — o único lugar dos links (05/10/2026).
//
// Decisão do Kauan em 05/10: os vídeos ficam no YouTube, não listados, e tocam
// dentro da própria página (player do youtube-nocookie), no artigo da tela e na
// seção "Vídeos" da central. Substituiu o campo `video` do artigo, que nunca
// chegou a ser preenchido — assim não há duas fontes.
//
// Para pôr um vídeo no ar: cole o link entre as aspas, do jeito que o YouTube
// dá (`https://youtu.be/…`, `https://www.youtube.com/watch?v=…`, `…/shorts/…`).
// Link vazio não aparece; link que não é do YouTube reprova no teste
// (`videos.test.ts`) e também não aparece.

import { idDoVideo } from "./youtube";

/**
 * Vídeos do Connect, pela chave do artigo (a do endereço `/ajuda/<chave>`,
 * ver `artigos/`). O vídeo toca no topo do artigo e entra na central.
 *
 * Ex.: `"bpo_contas_pagar": "https://youtu.be/xxxxxxxxxxx",`
 */
export const VIDEOS_DO_CONNECT: Readonly<Record<string, string>> = {};

/**
 * Vídeos do portal do cliente, pela chave do passo (`lib/portal/ajuda.ts`).
 * O vídeo toca dentro do passo e entra na seção "Vídeos" da ajuda do portal —
 * só para quem enxerga o passo (o módulo dele ligado).
 */
export const VIDEOS_DO_PORTAL: Readonly<Record<string, string>> = {
  // 01 — Entrar no portal
  entrar: "",
  // 02 — Pedir algo à 41
  solicitacao: "",
  // 03 — Responder uma pendência
  pendencia: "",
  // 04 — Aprovar pagamentos
  aprovar: "",
  // 05 — Acompanhar o financeiro
  financeiro: "",
  // 06 — Ler os comunicados
  comunicado: "",
  // 07 — Esqueci minha senha
  senha: "",
};

// `hasOwn`: a chave vem de endereço e de catálogo; "constructor" não é vídeo.
function linkValido(mapa: Readonly<Record<string, string>>, chave: string): string | null {
  const link = Object.hasOwn(mapa, chave) ? mapa[chave] : "";
  return idDoVideo(link) ? link.trim() : null;
}

/** O vídeo do artigo do Connect, se o link já foi colado e é do YouTube. */
export function videoDoArtigo(chave: string): string | null {
  return linkValido(VIDEOS_DO_CONNECT, chave);
}

/** O vídeo do passo da ajuda do portal, se o link já foi colado e é do YouTube. */
export function videoDoPassoDoPortal(chave: string): string | null {
  return linkValido(VIDEOS_DO_PORTAL, chave);
}
