"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { enderecoDaMiniatura, enderecoDoPlayer, idDoVideo } from "@/lib/ajuda/youtube";

const MOLDURA = "relative block aspect-video w-full overflow-hidden rounded-lg border border-border bg-black shadow-[var(--c41-shadow-xs)]";

/**
 * O vídeo de passo a passo tocando na própria página (05/10/2026).
 *
 * Até o clique, só a miniatura (de `i.ytimg.com`) e o botão de play: o player
 * do YouTube pesa e, mesmo no modo de privacidade (youtube-nocookie), só deve
 * carregar quando a pessoa quer assistir. Clicou, entra o player já tocando.
 * Link que não é do YouTube não renderiza nada — a página segue sem o vídeo.
 */
export function VideoDoYouTube({
  link,
  titulo,
  iniciar = false,
  className = "",
}: {
  link: string;
  /** O assunto do vídeo — vira o nome do player e do botão para o leitor de tela. */
  titulo: string;
  /** Já abre tocando — na janela da central, onde o clique foi no cartão. */
  iniciar?: boolean;
  className?: string;
}) {
  const id = idDoVideo(link);
  const [tocando, setTocando] = useState(iniciar);
  const player = useRef<HTMLIFrameElement>(null);
  const clicou = useRef(false);

  // O botão some no clique; o foco vai para o player em vez de cair no topo
  // da página (quem navega pelo teclado segue de onde estava).
  useEffect(() => {
    if (tocando && clicou.current) player.current?.focus();
  }, [tocando]);

  if (!id) return null;

  if (tocando) {
    return (
      <div className={`${MOLDURA} ${className}`.trim()}>
        <iframe
          ref={player}
          src={enderecoDoPlayer(id)}
          title={`Vídeo: ${titulo}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        clicou.current = true;
        setTocando(true);
      }}
      aria-label={`Assistir ao vídeo: ${titulo}`}
      className={`group ${MOLDURA} cursor-pointer ${className}`.trim()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do YouTube (i.ytimg.com): o otimizador do next/image buscaria do servidor uma imagem que o navegador já pega direto */}
      <img
        src={enderecoDaMiniatura(id)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <span aria-hidden className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15" />
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 inline-flex size-14 sm:size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-solid text-on-brand shadow-[var(--c41-shadow-lg)] transition-transform group-hover:scale-105"
      >
        <Play size={24} className="ml-1" fill="currentColor" />
      </span>
    </button>
  );
}
