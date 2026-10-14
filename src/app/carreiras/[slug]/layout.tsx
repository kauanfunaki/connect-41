import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { portalDaRequisicao } from "@/lib/carreiras/portalDaRequisicao";
import { MARCA_41_CARREIRAS } from "@/lib/carreiras/enderecoDeCarreiras";
// O recorte do triângulo do logo da 41 Tallent (public/41-tallent/marca.png),
// importado para sair com endereço do próprio Next — vale no endereço do 41
// Carreiras e no do Connect, sem passar pelo proxy.
import marca41Tallent from "../../../../public/41-tallent/marca.png";

/**
 * O ícone da aba (e do atalho na tela do celular) das páginas do 41
 * Carreiras: a marca da 41 Tallent, no lugar do ícone do Connect
 * (15/10/2026). Os outros escritórios seguem com o ícone de sempre.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const portal = await portalDaRequisicao((await params).slug);
  if (!portal?.da41) return {};
  const icone = { url: marca41Tallent.src, type: "image/png", sizes: `${marca41Tallent.width}x${marca41Tallent.height}` };
  return {
    // A descrição padrão das páginas do portal (a do Connect, "CRM interno…",
    // não pode aparecer na prévia de um link de candidato); cada página que
    // tem a sua troca esta.
    description: `Vagas em empresas cujos processos seletivos são conduzidos pela ${MARCA_41_CARREIRAS.recrutamento}.`,
    icons: { icon: [icone], apple: [icone], shortcut: [icone] },
  };
}

/** A barra do navegador no celular, no roxo do topo do 41 Carreiras. */
export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const portal = await portalDaRequisicao((await params).slug);
  return portal?.da41 ? { themeColor: "#3b0670", colorScheme: "light" } : {};
}

export default function PortalDeVagasLayout({ children }: { children: ReactNode }) {
  return children;
}
