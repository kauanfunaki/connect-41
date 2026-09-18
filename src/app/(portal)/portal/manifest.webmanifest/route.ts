import type { MetadataRoute } from "next";

// O manifesto do portal do cliente — separado do interno, e por necessidade.
//
// O convention file `app/manifest.ts` do Next só vale na raiz do `app`, e
// produz **um** `/manifest.webmanifest` para o site inteiro. Com um só, quem
// instalava a partir do portal recebia o app interno: `start_url: "/home"` abre
// a tela de login da equipe, que o cliente não tem como passar.
//
// Por isso este é um route handler comum, servido em `/portal/manifest.webmanifest`
// e referenciado pelo layout do portal. Os dois manifestos convivem na mesma
// origem porque têm `id` diferente — é o `id` (e não a URL do arquivo) que o
// navegador usa para saber se já instalou aquele app.
//
// `scope: "/portal"` é o que mantém a janela instalada dentro do portal: link
// para fora dele abre no navegador, em vez de levar o cliente para uma tela
// interna dentro do app dele.

const MANIFESTO: MetadataRoute.Manifest = {
  id: "/portal",
  name: "Portal do Cliente · 41",
  short_name: "Portal 41",
  description: "Documentos, contas, aprovações e conversa com o escritório",
  start_url: "/portal",
  scope: "/portal",
  display: "standalone",
  background_color: "#0B1F42",
  theme_color: "#1B4FD8",
  lang: "pt-BR",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

export function GET(): Response {
  return Response.json(MANIFESTO, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
