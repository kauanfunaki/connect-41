import Link from "next/link";
import { History } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, TIPOS, LINK_DO_ITEM, diaDoRegistro, horaDoRegistro, type Alteracao } from "@/lib/tech-interno/regras";
import { CORES_DO_TIPO } from "@/lib/tech-interno/cores";
import { MODULO_OPS } from "@/lib/ops/regras";
import { historicoTech } from "@/lib/tech-interno/servidor";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { MudancasDoRegistro } from "@/components/tech-interno/MudancasDoRegistro";
import { VisoesDoControle, AcoesDoControle } from "@/components/tech-interno/NavegacaoTech";

export const dynamic = "force-dynamic";

// O histórico do módulo inteiro (29/10/2026), como uma visão ao lado de Lista,
// Kanban e Agenda: por dia, com a hora, quem fez, em qual item e o que mudou,
// campo a campo. O detalhe do item continua com a linha do tempo dele.
export default async function HistoricoTechPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), params = await searchParams;
  const texto = (chave: string) => typeof params[chave] === "string" ? (params[chave] as string).trim() : "";
  const p = Number(texto("page") || 1), q = texto("q").slice(0, 200), autor = texto("autor").slice(0, 191);
  const [{ total, pages, page, changes, autores }, podeEditar, podeGerirOps] = await Promise.all([
    historicoTech(ctx, { pagina: Number.isInteger(p) && p > 0 ? Math.min(p, 1000000) : 1, q, autor }),
    podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir"), podeNoModulo(ctx, MODULO_OPS, "gerir"),
  ]);
  const aqui = new URLSearchParams(); if (q) aqui.set("q", q); if (autor) aqui.set("autor", autor);
  const hrefPagina = (n: number) => { const u = new URLSearchParams(aqui); u.set("page", String(n)); return `${ROTA_TECH_INTERNO}/historico?${u}`; };
  const dias: { chave: string; rotulo: string; registros: typeof changes }[] = [];
  for (const c of changes) {
    const dia = diaDoRegistro(c.createdAt);
    if (dias.at(-1)?.chave !== dia.chave) dias.push({ ...dia, registros: [] });
    dias.at(-1)!.registros.push(c);
  }
  return <PageContainer>
    <PageHeader title="Controle interno" subtitle="Quem mudou o quê, e quando, em cada item da equipe Tech." action={<AcoesDoControle podeEditar={podeEditar} podeGerirOps={podeGerirOps} novoHref={`${ROTA_TECH_INTERNO}/novo`} />} />
    <div className="mb-4"><VisoesDoControle ativa="historico" href={v => v === "historico" ? `${ROTA_TECH_INTERNO}/historico` : `${ROTA_TECH_INTERNO}?visao=${v}`} /></div>
    <CascoDaTabela buscaAEsquerda contagem={`${total} ${total === 1 ? "registro" : "registros"}`}
      busca={<DebouncedSearchInput key={q} paramName="q" placeholder="Buscar pelo título do item" />}
      filtros={<FiltrosDaTela naBarra campos={[{ chave: "autor", rotulo: "Pessoa", vazioLabel: "Todas", opcoes: autores.map(a => ({ value: a.authorId, label: a.authorName })) }]} />}>
      {!changes.length ? <EmptyState icon={<History />} title={q || autor ? "Nenhum registro neste recorte" : "Nada registrado ainda"}
        description={q || autor ? "Ajuste a busca ou a pessoa para ver outros registros." : "Cada criação e alteração de item aparece aqui, com quem fez e quando."} />
        : dias.map(dia => <section key={dia.chave} aria-labelledby={`dia-${dia.chave}`}>
          <h2 id={`dia-${dia.chave}`} className="sticky top-0 z-[1] flex items-baseline gap-2 border-b border-border bg-surface px-4 py-2 text-label font-semibold text-fg">
            {dia.rotulo}<span className="text-helper font-normal text-fg-muted">{dia.registros.length} {dia.registros.length === 1 ? "registro" : "registros"}</span>
          </h2>
          <ol className="divide-y divide-border">{dia.registros.map(c => {
            const criacao = c.version === 0, changesDoRegistro = c.changes as unknown as Alteracao[];
            return <li key={c.id} className="relative cursor-pointer transition-colors hover:bg-surface-hover grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-4 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
              <time dateTime={c.createdAt.toISOString()} className="text-helper tabular-nums text-fg-muted sm:pt-1">{horaDoRegistro(c.createdAt)}</time>
              <div className="flex min-w-0 gap-3">
                <AvatarImage src={null} name={c.authorName} size={28} className="mt-0.5 hidden shrink-0 sm:block" />
                <div className="min-w-0 flex-1 max-w-3xl">
                  <p className="text-ui text-fg-secondary break-words"><span className="font-medium text-fg">{c.authorName}</span> {criacao ? "criou o item" : changesDoRegistro.length === 1 ? "alterou 1 campo de" : `alterou ${changesDoRegistro.length} campos de`}</p>
                  <p className="flex flex-wrap items-baseline gap-x-2 text-ui">
                    <Link href={`${ROTA_TECH_INTERNO}/${c.itemId}`} className={`font-semibold text-fg underline-offset-2 hover:text-brand hover:underline break-words [overflow-wrap:anywhere] ${LINK_DO_ITEM}`}>{c.item.title}</Link>
                    <span className="flex items-center gap-1.5 text-helper text-fg-secondary"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: CORES_DO_TIPO[c.item.type] }} />{TIPOS[c.item.type]}</span>
                  </p>
                  <MudancasDoRegistro changes={changesDoRegistro} criacao={criacao} />
                </div>
              </div>
            </li>;
          })}</ol>
        </section>)}
    </CascoDaTabela>
    {pages > 1 && <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-end gap-3 text-helper">
      {page > 1 && <Button variant="secondary" size="sm" href={hrefPagina(page - 1)}>Anterior</Button>}
      <span>Página {page} de {pages}</span>{page < pages && <Button variant="secondary" size="sm" href={hrefPagina(page + 1)}>Próxima</Button>}
    </nav>}
  </PageContainer>;
}
