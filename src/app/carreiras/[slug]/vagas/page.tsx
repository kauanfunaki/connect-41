import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MARCA_41_CARREIRAS, enderecoPublicoDoPortal, imagemDeCompartilhamento } from "@/lib/carreiras/enderecoDeCarreiras";
import { lerFiltros, temFiltro, urlDaListaEm } from "@/lib/carreiras/portal";
import { listaDoPortal } from "@/lib/carreiras/apresentacao";
import { metadadosDo41 } from "@/lib/carreiras/metadados41";
import { portalDaRequisicao } from "@/lib/carreiras/portalDaRequisicao";
import { escritorioDoPortal, vagaDoPortal, vagasAbertasDoPortal } from "@/lib/carreiras/vagasDoPortal";
import { Lista41 } from "@/components/carreiras/41/Lista41";

// Lê o host, as variáveis e as vagas abertas a cada pedido.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params;
  const portal = await portalDaRequisicao(slug);
  if (!portal?.da41) return { title: "Vagas abertas", robots: { index: false, follow: false } };
  const busca = await searchParams;
  const meta = metadadosDo41({
    titulo: `Vagas abertas · ${MARCA_41_CARREIRAS.nome}`,
    descricao: `Todas as vagas abertas no ${MARCA_41_CARREIRAS.nome}, com busca por cargo, cidade, modelo de trabalho, contrato e área.`,
    url: enderecoPublicoDoPortal(slug, { tipo: "vagas" }),
    imagem: imagemDeCompartilhamento(slug, null),
    imagemAlt: `${MARCA_41_CARREIRAS.nome}: vagas abertas`,
  });
  // A lista filtrada (ou com uma vaga aberta ao lado) é a mesma página: fora
  // do índice, com o canônico na lista inteira.
  const filtrada = temFiltro(lerFiltros(busca)) || !!busca.vaga || !!busca.pagina;
  return filtrada ? { ...meta, robots: { index: false, follow: true } } : meta;
}

/**
 * `/vagas` do 41 Carreiras (15/10/2026): todas as vagas, com a busca, os
 * filtros, a ordem e a vaga escolhida ao lado. Só do escritório da 41 — nos
 * outros, a lista continua em `/carreiras/<escritorio>`.
 */
export default async function VagasPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const busca = await searchParams;
  const portal = await portalDaRequisicao(slug);
  if (!portal) notFound();
  if (!portal.da41) redirect(urlDaListaEm(portal.rotas.lista, lerFiltros(busca)));

  const tenant = await escritorioDoPortal(slug);
  if (!tenant) notFound();

  const agora = new Date();
  const todas = await vagasAbertasDoPortal(tenant.id, agora);
  const lista = listaDoPortal(todas, busca);
  const detalhe = lista.escolhida ? await vagaDoPortal(tenant.id, lista.escolhida.id, agora) : null;

  return <Lista41 slug={slug} rotas={portal.rotas} todas={todas} lista={lista} detalhe={detalhe} agora={agora} />;
}
