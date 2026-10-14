import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MARCA_41_CARREIRAS, enderecoPublicoDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { portalDaRequisicao } from "@/lib/carreiras/portalDaRequisicao";
import { Privacidade41 } from "@/components/carreiras/41/Privacidade41";

// Lê o host e as variáveis a cada pedido (o portal só existe com elas).
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const portal = await portalDaRequisicao(slug);
  if (!portal?.da41) return { title: "Página não encontrada", robots: { index: false, follow: false } };
  const url = enderecoPublicoDoPortal(slug, { tipo: "privacidade" });
  return {
    title: { absolute: `Seus dados neste portal · ${MARCA_41_CARREIRAS.nome}` },
    description: `Resumo de como o ${MARCA_41_CARREIRAS.nome} usa os dados de quem se candidata, com o link para a política de privacidade da ${MARCA_41_CARREIRAS.recrutamento}.`,
    ...(url ? { alternates: { canonical: url } } : {}),
  };
}

/**
 * `/privacidade` do 41 Carreiras (15/10/2026): o resumo, para o candidato, de
 * como o portal usa os dados dele — o texto oficial é a política da 41
 * Tallent, para onde a página aponta. Não usa o banco. Só do escritório da
 * 41 — os outros escritórios não têm esta página.
 */
export default async function PrivacidadePage({ params }: Params) {
  const { slug } = await params;
  const portal = await portalDaRequisicao(slug);
  if (!portal?.da41) notFound();
  return <Privacidade41 rotas={portal.rotas} />;
}
