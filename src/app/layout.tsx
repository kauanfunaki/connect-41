import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SCRIPT_DO_TEMA } from "@/lib/theme";

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
  // servidor não sabe o tema do aparelho. Por isso o suppressHydrationWarning:
  // o atributo do <html> pode já ter mudado quando o React hidrata.
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
      </body>
    </html>
  );
}
