import type { Metadata } from "next";

// `manifest` aqui, e não no layout raiz: é o que faz o navegador oferecer
// **o portal** para instalar quando o cliente está no portal. O layout raiz
// segue apontando o manifesto interno para o resto do site.
export const metadata: Metadata = {
  title: "Portal do Cliente · 41",
  manifest: "/portal/manifest.webmanifest",
};

// Shell próprio do portal — sem sidebar de setor, sem troca de workspace, sem
// nada de /admin. Separado do `(app)` de propósito: layout compartilhado é como
// um componente interno vaza para dentro do portal por herança, sem ninguém
// decidir que ele deveria estar ali.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>;
}
