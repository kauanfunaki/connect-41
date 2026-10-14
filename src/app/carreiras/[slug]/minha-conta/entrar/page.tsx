import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Entrar } from "@/components/carreiras/ContaDoCandidato";
import { CabecalhoPublico } from "@/components/publico/CabecalhoPublico";
import { MolduraDoPortal } from "@/components/carreiras/MolduraDe41Carreiras";
import { MARCA_41_CARREIRAS, nomeDoEscritorio } from "@/lib/carreiras/enderecoDeCarreiras";
import { portalDaRequisicao } from "@/lib/carreiras/portalDaRequisicao";

export const dynamic = "force-dynamic";

// Sem Referer: o endereço desta página leva o token do link.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const portal = await portalDaRequisicao((await params).slug);
  const title = portal?.da41 ? { absolute: `Entrar — minhas candidaturas · ${MARCA_41_CARREIRAS.nome}` } : "Entrar — minhas candidaturas";
  return { title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * Onde o link do e-mail cai. **Não entra sozinho**: pede um clique. Leitor de
 * e-mail corporativo abre os links da mensagem para checar segurança, e um link
 * de uso único gasto por ele deixaria o candidato sem conseguir entrar.
 */
export default async function EntrarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  // No endereço do 41 Carreiras só existe o escritório da 41.
  const portal = await portalDaRequisicao(slug);
  if (!portal) notFound();
  const tenant = await getPrisma().tenant.findUnique({ where: { slug }, select: { name: true, logoUrl: true, active: true } });
  if (!tenant || !tenant.active) notFound();

  return (
    <MolduraDoPortal portal={portal} logo={tenant.logoUrl}>
      <div className="max-w-md mx-auto">
        <CabecalhoPublico centralizado titulo="Minhas candidaturas" subtitulo={nomeDoEscritorio(portal, tenant.name)} />
        <Card className="p-5">
          {t ? (
            <Entrar slug={slug} token={t} />
          ) : (
            // Revisão de 05/10: botão não é link — pedir outro link é ação.
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <p className="text-ui text-fg">Link incompleto.</p>
              <Button href={portal.rotas.conta} variant="secondary" size="sm">
                Pedir novo link
              </Button>
            </div>
          )}
        </Card>
      </div>
    </MolduraDoPortal>
  );
}
