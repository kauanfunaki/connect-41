import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SCRIPT_DO_TEMA } from "@/lib/theme";
import { ValidacaoDosFormularios } from "@/components/ui/ValidacaoDosFormularios";
import { DicaFlutuante } from "@/components/shared/DicaFlutuante";

const plexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-fg font-sans">
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
