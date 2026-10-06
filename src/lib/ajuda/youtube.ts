// Os vídeos da ajuda são do YouTube, não listados (05/10/2026): o link que a
// equipe cola em `videos.ts` vira o id do vídeo, e o id vira o player e a
// miniatura. Leve de propósito — roda no navegador, no player da central.

/** O id de um vídeo do YouTube: 11 letras, números, `-` ou `_`. */
const ID = /^[A-Za-z0-9_-]{11}$/;

// Só os endereços do próprio YouTube: um link de outro site com `?v=` no fim
// não pode virar vídeo da ajuda.
const HOSTS_DO_YOUTUBE = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Os caminhos que trazem o id logo depois: `/shorts/<id>`, `/embed/<id>`… */
const CAMINHOS_COM_ID = new Set(["shorts", "embed", "live", "v"]);

/**
 * O id do vídeo a partir do link do YouTube, nos formatos que o botão
 * "Compartilhar" e a barra de endereço dão: `watch?v=`, `youtu.be/`,
 * `shorts/` e `embed/`, com ou sem parâmetros extras (`&t=`, `?si=`) e com ou
 * sem `https://`. Link vazio, de outro site ou sem id válido → `null`.
 */
export function idDoVideo(link: string | null | undefined): string | null {
  const texto = (link ?? "").trim();
  if (!texto) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const [primeiro, segundo] = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined = null;
  if (host === "youtu.be" || host === "www.youtu.be") id = primeiro;
  else if (HOSTS_DO_YOUTUBE.has(host)) {
    if (primeiro === "watch") id = url.searchParams.get("v");
    else if (primeiro && CAMINHOS_COM_ID.has(primeiro)) id = segundo;
  }
  return id && ID.test(id) ? id : null;
}

/**
 * O player no modo de privacidade do YouTube (youtube-nocookie): sem cookie
 * até a pessoa dar o play. `rel=0` deixa as sugestões do fim no próprio canal.
 */
export function enderecoDoPlayer(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

/** A miniatura que o YouTube gera para todo vídeo (480×360, existe sempre). */
export function enderecoDaMiniatura(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** O vídeo no site do YouTube — o "Abrir no YouTube" sai sempre por aqui. */
export function enderecoNoYouTube(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
