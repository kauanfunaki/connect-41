import type { Metadata } from "next";

export const metadata: Metadata = { title: "Portal do Cliente · 41" };

// Shell próprio do portal — sem sidebar de setor, sem troca de workspace, sem
// nada de /admin. Separado do `(app)` de propósito: layout compartilhado é como
// um componente interno vaza para dentro do portal por herança, sem ninguém
// decidir que ele deveria estar ali.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>;
}
