import type { MetadataRoute } from "next";

// O app interno. O do cliente é outro, em `app/(portal)/portal/manifest.webmanifest`
// — o convention file do Next só existe na raiz, e um manifesto só significava
// instalar o portal e cair no login da equipe.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Explícito porque o padrão é a `start_url`: com `id` fixo, mudar a tela
    // inicial um dia não faz o navegador achar que é outro app.
    id: "/home",
    name: "Connect — 41 Tech",
    short_name: "Connect",
    description: "CRM interno multi-setor da 41 Tech",
    start_url: "/home",
    display: "standalone",
    background_color: "#0B1F42",
    theme_color: "#1B4FD8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
