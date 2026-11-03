import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { SCRIPT_DO_TEMA } from "@/lib/theme";
import { ValidacaoDosFormularios } from "@/components/ui/ValidacaoDosFormularios";
import { DicaFlutuante } from "@/components/shared/DicaFlutuante";

// As fontes ficam no repositório (`src/fontes`, OFL), desde 30/10/2026: com
// `next/font/google` o build baixava as fontes a cada vez, e quando o download
// falhava o build caía ("next/font/google queries have exactly one entry") — o
// CI do #345 caiu assim. Mesmos pesos, variáveis e subsets (latin + latin-ext)
// de antes; os arquivos e como gerá-los estão em `src/fontes/LEIA-ME.md`.
const plexSans = localFont({
  src: "../fontes/IBMPlexSans-wght.woff2",
  variable: "--font-ibm-plex-sans",
  weight: "400 700",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fontes/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "../fontes/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  // A fonte de reserva com as medidas ajustadas é calculada sobre a Arial;
  // para uma monoespaçada isso desalinharia mais do que ajudaria.
  adjustFontFallback: false,
});

const spaceGrotesk = localFont({
  src: "../fontes/SpaceGrotesk-wght.woff2",
  variable: "--font-space-grotesk",
  weight: "500 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Connect",
  description: "CRM interno multi-setor da 41 Tech",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  // "system" renderiza claro e o SCRIPT_DO_TEMA troca antes da pintura — o
  // servidor não sabe o tema do aparelho. O mesmo vale para o portal sem
  // cookie, que segue o aparelho desde 08/10/2026 (ver lib/theme.ts). Por isso
  // o suppressHydrationWarning: o atributo do <html> pode já ter mudado quando
  // o React hidrata.
  const theme = cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-fg font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {SCRIPT_DO_TEMA}
        </Script>
        {children}
        {/* O balão próprio no lugar do "Preencha este campo" do navegador, em
            todo formulário do app — equipe, portal e telas públicas. */}
        <ValidacaoDosFormularios />
        {/* A dica do Connect no lugar do balão do `title` em toda tela — também
            na entrada, nas vagas e no teste (08/10/2026). Os layouts da equipe
            e do portal montam a deles; só uma escuta a página. */}
        <DicaFlutuante />
      </body>
    </html>
  );
}
