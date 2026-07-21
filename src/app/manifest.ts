import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
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
