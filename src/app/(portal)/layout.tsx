import type { Metadata } from "next";
import { AvisoDeVersaoNova } from "@/components/shell/AvisoDeVersaoNova";
import { DicaFlutuante } from "@/components/shared/DicaFlutuante";

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
//
// O aviso de versão nova entra por decisão (29/09): o portal instalado como
// aplicativo fica aberto por dias, e é onde uma aba antiga mais aparece.
//
// `min-h-dvh`, como a moldura de dentro (07/10/2026): com `min-h-screen`
// (100vh, maior que a área visível no navegador do celular), esta caixa ficava
// mais alta que a moldura `h-dvh` e a página inteira rolava um pedaço.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <AvisoDeVersaoNova quem="O portal" />
      <DicaFlutuante />
      {children}
    </div>
  );
}
