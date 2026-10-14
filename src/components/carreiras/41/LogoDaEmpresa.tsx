"use client";

import { iniciaisDaEmpresa } from "@/lib/carreiras/apresentacao";

/**
 * Esconde o logo que não carregou antes de o React hidratar (o `onError` só
 * pega o erro de depois) — as iniciais, que estão por baixo, aparecem.
 */
function esconderSeJaQuebrou(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth === 0) img.hidden = true;
}

/**
 * O logo da empresa da vaga — ou as iniciais dela, num ladrilho lilás. O logo
 * vem da rota pública `/api/carreiras/logo/<escritorio>/<vaga>`, que só serve
 * o de uma vaga publicada. As iniciais ficam por baixo: se a imagem falhar,
 * ela some e elas aparecem. O nome da empresa já está no texto ao lado, então
 * a imagem é decorativa (alt vazio).
 */
export function LogoDaEmpresa({ src, nome, grande = false }: { src: string | null; nome: string; grande?: boolean }) {
  const tamanho = grande ? " t41-logo-empresa--grande" : "";
  const iniciais = iniciaisDaEmpresa(nome);
  if (!src) {
    return (
      <span className={`t41-logo-empresa t41-logo-empresa--iniciais${tamanho}`} aria-hidden="true">
        {iniciais}
      </span>
    );
  }
  return (
    <span className={`t41-logo-empresa t41-logo-empresa--iniciais${tamanho}`} aria-hidden="true" style={{ position: "relative" }}>
      {iniciais}
      {/* eslint-disable-next-line @next/next/no-img-element -- logo de terceiro, de tamanho livre, servido pela rota do portal */}
      <img
        ref={esconderSeJaQuebrou}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.hidden = true;
        }}
        style={{ position: "absolute", inset: 0, background: "#fff" }}
      />
    </span>
  );
}
