import type { Metadata } from "next";
import { MARCA_41_CARREIRAS } from "./enderecoDeCarreiras";

// Os metadados de compartilhamento das páginas do 41 Carreiras (15/10/2026):
// o título, a descrição, o canônico e a imagem que o LinkedIn, o WhatsApp e o
// Pandapé mostram na prévia do link. A imagem é gerada pela rota
// `/api/carreiras/og/…` e o endereço dela é sempre o do endereço principal
// do portal (ver `imagemDeCompartilhamento`).

export const TAMANHO_DA_IMAGEM = { width: 1200, height: 630 } as const;

export function metadadosDo41(p: {
  titulo: string;
  descricao: string;
  /** O endereço canônico da página (absoluto), ou null. */
  url: string | null;
  /** A imagem de compartilhamento (absoluta), ou null. */
  imagem: string | null;
  /** O texto alternativo da imagem. */
  imagemAlt: string;
}): Metadata {
  const imagens = p.imagem ? [{ url: p.imagem, ...TAMANHO_DA_IMAGEM, alt: p.imagemAlt, type: "image/png" }] : undefined;
  return {
    title: { absolute: p.titulo },
    description: p.descricao,
    ...(p.url ? { alternates: { canonical: p.url } } : {}),
    openGraph: {
      type: "website",
      title: p.titulo,
      description: p.descricao,
      ...(p.url ? { url: p.url } : {}),
      siteName: MARCA_41_CARREIRAS.nome,
      locale: "pt_BR",
      ...(imagens ? { images: imagens } : {}),
    },
    twitter: {
      card: imagens ? "summary_large_image" : "summary",
      title: p.titulo,
      description: p.descricao,
      ...(imagens ? { images: imagens.map((i) => i.url) } : {}),
    },
  };
}
