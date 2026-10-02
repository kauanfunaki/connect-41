import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Lightbulb, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { artigoDaChave, moduloDoArtigo } from "@/lib/ajuda/artigos";

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

  return (
    <PageContainer>
      <Link
        href={voltarPara ?? "/ajuda"}
        className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg transition-colors mb-3"
      >
        <ArrowLeft size={14} /> {voltarPara ? "Voltar para a tela" : "Ajuda"}
      </Link>
      <PageHeader
        title={artigo.titulo}
        subtitle={artigo.resumo}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {artigo.video && (
              <Button variant="secondary" href={artigo.video} target="_blank" rel="noreferrer">
                <PlayCircle size={15} /> Assistir ao vídeo
              </Button>
            )}
            {abrir && abrir !== voltarPara && (
              <Button href={abrir}>
                Abrir a tela <ArrowUpRight size={15} />
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {artigo.secoes.map((s, i) => (
            <section key={s.titulo} aria-labelledby={`secao-${i}`} className="flex flex-col gap-3">
              <h2 id={`secao-${i}`} className="text-[length:var(--fs-section)] font-semibold text-fg">
                {s.titulo}
              </h2>
              <ol className="flex flex-col gap-2">
                {s.passos.map((passo, j) => (
                  <li key={j} className="flex items-start gap-3 text-[14px] leading-relaxed text-fg">
                    <span className="mt-0.5 inline-flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-semibold text-brand tabular-nums">
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
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">
                <Lightbulb size={14} className="text-warning" /> Bom saber
              </p>
              <ul className="flex flex-col gap-2">
                {artigo.dicas.map((d) => (
                  <li key={d} className="text-[13px] leading-relaxed text-fg-secondary">
                    {d}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-4 flex flex-col gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-fg-muted">Nesta página</p>
            <ul className="flex flex-col gap-1.5">
              {artigo.secoes.map((s, i) => (
                <li key={s.titulo}>
                  <a href={`#secao-${i}`} className="text-[13px] text-brand hover:underline">
                    {s.titulo}
                  </a>
                </li>
              ))}
            </ul>
            <Link href="/ajuda" className="mt-1 text-[12.5px] text-fg-muted hover:text-fg">
              Ver toda a ajuda →
            </Link>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
