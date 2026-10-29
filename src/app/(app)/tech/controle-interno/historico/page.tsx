import Link from "next/link";
import { History, PencilLine, Plus } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, destinoDeVolta, comVolta, resumoDoRegistro, type Alteracao } from "@/lib/tech-interno/regras";
import { historicoTech } from "@/lib/tech-interno/servidor";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// O histórico do módulo inteiro (29/10/2026): cada alteração de item, com quem
// fez, o que mudou e quando. O detalhe do item continua com a linha do tempo dele.
export default async function HistoricoTechPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), params = await searchParams, voltar = destinoDeVolta(params.voltar);
  const p = Number(typeof params.page === "string" ? params.page : 1);
  const { total, pages, page, changes } = await historicoTech(ctx, Number.isInteger(p) && p > 0 ? Math.min(p, 1000000) : 1);
  const hrefPagina = (n: number) => comVolta(`${ROTA_TECH_INTERNO}/historico?page=${n}`, voltar);
  return <PageContainer><PageHeader title="Histórico" subtitle="Quem mudou o quê, e quando, nos itens do Controle interno." action={<Button variant="secondary" href={voltar}>Voltar para a lista</Button>} />
    <Card as="section" className="min-w-0 p-5 max-w-4xl">
      {!changes.length ? <EmptyState icon={<History />} title="Nada registrado ainda" description="Cada criação e alteração de item aparece aqui, com quem fez e quando." /> : <>
        <p className="mb-4 text-helper text-fg-muted">{total} {total === 1 ? "registro" : "registros"}</p>
        <ol className="flex flex-col" aria-label="Histórico do Controle interno">{changes.map(c => {
          const { frase, detalhes } = resumoDoRegistro(c.changes as unknown as Alteracao[], c.version), Icone = c.version === 0 ? Plus : PencilLine;
          return <li key={c.id} className="relative flex gap-3 pb-5 last:pb-0 min-w-0 before:absolute before:left-[13px] before:top-8 before:bottom-1 before:w-px before:bg-border last:before:hidden">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-secondary"><Icone size={14} /></span>
            <div className="min-w-0 flex-1">
              <Link href={comVolta(`${ROTA_TECH_INTERNO}/${c.itemId}`, voltar)} className="text-ui font-medium text-fg hover:text-brand break-words [overflow-wrap:anywhere]">{c.item.title}</Link>
              <p className="text-ui text-fg break-words"><span className="font-medium">{c.authorName}</span> <span className="text-fg-secondary">{frase}</span></p>
              <time dateTime={c.createdAt.toISOString()} className="text-helper text-fg-muted">{formatInstantDateTime(c.createdAt)}</time>
              {!!detalhes.length && <ul className="mt-2 flex flex-col gap-1 text-helper text-fg-secondary">{detalhes.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>}
            </div>
          </li>;
        })}</ol>
      </>}
    </Card>
    {pages > 1 && <nav aria-label="Paginação" className="flex flex-wrap justify-end items-center gap-3 mt-4 text-helper max-w-4xl">
      {page > 1 && <Button variant="secondary" size="sm" href={hrefPagina(page - 1)}>Anterior</Button>}
      <span>Página {page} de {pages}</span>{page < pages && <Button variant="secondary" size="sm" href={hrefPagina(page + 1)}>Próxima</Button>}
    </nav>}
  </PageContainer>;
}
