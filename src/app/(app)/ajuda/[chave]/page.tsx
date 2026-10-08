import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ChevronRight, LifeBuoy, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VideoDoYouTube } from "@/components/ajuda/VideoDoYouTube";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { artigoDaChave, moduloDoArtigo } from "@/lib/ajuda/artigos";
import { videoDoArtigo } from "@/lib/ajuda/videos";
import { enderecoNoYouTube, idDoVideo } from "@/lib/ajuda/youtube";

/**
 * O passo a passo de uma tela (02/10/2026) — o destino do "?" do topo quando
 * a tela aberta tem artigo, e de cada cartão da central.
 *
 * Artigo de módulo só abre para quem enxerga o módulo ligado: é o mesmo
 * critério da central, que nunca mostra tela que a pessoa não abre.
 */
export default async function ArtigoDeAjudaPage({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<{ de?: string }>;
}) {
  const [{ chave }, { de }] = await Promise.all([params, searchParams]);
  const artigo = artigoDaChave(decodeURIComponent(chave));
  if (!artigo) notFound();

  const ctx = await getAuthContext();
  const modulo = moduloDoArtigo(artigo);
  if (modulo) {
    const estado = (await getTenantModuleStates(ctx.tenantId)).find((m) => m.code === modulo);
    if (!estado?.enabled || !canViewSector(ctx, estado.sectorCode)) notFound();
  }

  // "Voltar" leva à tela de onde a pessoa veio pelo "?" — só caminho interno.
  const voltarPara = de && de.startsWith("/") && !de.startsWith("//") ? de : null;
  const abrir = artigo.caminhos[0];
  const video = videoDoArtigo(artigo.chave);
  const idDoVideoDoArtigo = idDoVideo(video);

  return (
    <PageContainer>
      {/* Onde a pessoa está: a central de ajuda e, dentro dela, este artigo
          (revisão de 05/10 — o "Ver toda a ajuda" no fim do cartão passava
          batido). "Voltar para a tela" só quando ela veio pelo "?". */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3 text-fs-3">
        <nav aria-label="Caminho" className="flex items-center gap-1.5 min-w-0">
          <Link href="/ajuda" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline flex-shrink-0">
            <LifeBuoy size={14} /> Central de ajuda
          </Link>
          <ChevronRight size={13} aria-hidden className="text-fg-muted flex-shrink-0" />
          <span className="text-fg-secondary truncate">{artigo.titulo}</span>
        </nav>
        {voltarPara && (
          <Link href={voltarPara} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg transition-colors">
            <ArrowLeft size={14} /> Voltar para a tela
          </Link>
        )}
      </div>
      <PageHeader
        title={artigo.titulo}
        subtitle={artigo.resumo}
        action={
          abrir && abrir !== voltarPara ? (
            <Button href={abrir}>
              Abrir a tela <ArrowUpRight size={15} />
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {/* O vídeo toca aqui, no topo do passo a passo (05/10/2026) — antes
              era um botão "Assistir ao vídeo" que levava para o YouTube. O
              "Abrir no YouTube" fica para quem quer a tela cheia de lá. */}
          {video && idDoVideoDoArtigo && (
            <div className="flex flex-col gap-2 max-w-3xl">
              <VideoDoYouTube link={video} titulo={artigo.titulo} />
              <Button
                variant="secondary"
                size="xs"
                href={enderecoNoYouTube(idDoVideoDoArtigo)}
                target="_blank"
                rel="noreferrer"
                className="self-end"
              >
                Abrir no YouTube <ArrowUpRight size={13} />
              </Button>
            </div>
          )}
          {artigo.secoes.map((s, i) => (
            <section key={s.titulo} aria-labelledby={`secao-${i}`} className="flex flex-col gap-3">
              <h2 id={`secao-${i}`} className="text-section font-semibold text-fg">
                {s.titulo}
              </h2>
              <ol className="flex flex-col gap-2">
                {s.passos.map((passo, j) => (
                  <li key={j} className="flex items-start gap-3 text-fs-4 leading-relaxed text-fg">
                    <span className="mt-0.5 inline-flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-fs-2 font-semibold text-brand tabular-nums">
                      {j + 1}
                    </span>
                    <span className="min-w-0 max-w-[72ch]">{passo}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          {artigo.dicas && artigo.dicas.length > 0 && (
            <Card className="p-4 flex flex-col gap-2.5">
              <p className="flex items-center gap-2 text-fs-2 font-semibold uppercase tracking-wide text-fg-muted">
                <Lightbulb size={14} className="text-warning-fg" /> Bom saber
              </p>
              <ul className="flex flex-col gap-2">
                {artigo.dicas.map((d) => (
                  <li key={d} className="text-fs-3 leading-relaxed text-fg-secondary">
                    {d}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-4 flex flex-col gap-2">
            <p className="text-fs-2 font-semibold uppercase tracking-wide text-fg-muted">Nesta página</p>
            <ul className="flex flex-col gap-1.5">
              {artigo.secoes.map((s, i) => (
                <li key={s.titulo}>
                  <a href={`#secao-${i}`} className="text-fs-3 text-brand hover:underline">
                    {s.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          {/* A saída para a central, em cartão próprio e com botão — era um
              "Ver toda a ajuda →" cinza no pé do cartão acima (05/10). */}
          <Card className="p-4 flex flex-col gap-2.5 bg-brand-subtle border-brand/25">
            <p className="flex items-center gap-2 text-fs-4 font-semibold text-fg">
              <LifeBuoy size={16} className="text-brand" /> Não achou o que procurava?
            </p>
            <p className="text-fs-3 leading-relaxed text-fg-secondary">
              A central de ajuda reúne o passo a passo de todas as telas que você usa, com busca.
            </p>
            <Button variant="secondary" size="sm" href="/ajuda" className="self-start">
              Abrir a central de ajuda
            </Button>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
