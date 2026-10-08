"use client";

/**
 * Esconde o logo que não carregou antes de o React hidratar: o `onError` só
 * pega o erro que acontece depois. Os logos são jpg, png ou webp (a rota de
 * envio só aceita esses), então `naturalWidth` 0 com a imagem completa é
 * imagem quebrada.
 */
function esconderSeJaQuebrou(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth === 0) img.hidden = true;
}

/**
 * O logo do escritório no topo das telas públicas (portal de vagas, admissão e
 * teste). Se a imagem não carregar, some — em vez do ícone de imagem quebrada
 * na frente de quem nem é do escritório. O nome do escritório já está no texto
 * da tela.
 */
export function LogoDoEscritorio({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={esconderSeJaQuebrou}
      src={src}
      alt={alt}
      onError={(e) => {
        e.currentTarget.hidden = true;
      }}
      className={className}
    />
  );
}
