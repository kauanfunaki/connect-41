import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Accordion } from "@/components/ui/Accordion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ControlesBuscaChamados } from "@/components/chamados/ControlesBuscaChamados";
import { contexto } from "@/lib/chamados/contexto";
import { podeAbrir, podeGerenciar, podeVerInterno } from "@/lib/chamados/acesso";
import { lista, categorias, usuarios, resumoRascunho } from "@/lib/chamados/consultas";
import { getActiveSectors } from "@/lib/sectors";
import { ROTULOS, ROTULOS_PRIORIDADE } from "@/lib/chamados/regras";
import { formatInstantDate } from "@/lib/format";
import { BotaoFixarTela } from "@/components/setor/BotaoFixarTela";
import { codigosDeTelasFixadas } from "@/lib/telasFixadas-data";
import { corDaCategoria } from "@/lib/chamados/cores";
import { caminhoDaCategoria } from "@/lib/chamados/catalogo";

export const dynamic = "force-dynamic";
type Filtros = Record<string, string | undefined>;
export default async function ChamadosPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const c = await contexto().catch(() => null); if (!c) notFound();
  const filtros = await searchParams;
  const [dados, cats, users, setores] = await Promise.all([lista(c, filtros), categorias(c, true), usuarios(c), getActiveSectors(c.ctx.tenantId)]);
  if (!podeAbrir(c.ctx, c.config) && !podeVerInterno(c.ctx, c.config) && !dados.total && !dados.drafts.length) {
    const anteriores = await lista(c, { aba: "historico" }); if (!anteriores.total) notFound();
  }
  const internos = podeVerInterno(c.ctx, c.config);
  const nome = (id: string) => users.find(u => u.id === id)?.name ?? "Usuário indisponível";
  const fixadas = await codigosDeTelasFixadas(c.ctx.userId, c.ctx.tenantId);
  const aba = ["fila", "aguardando", "pausa", "historico"].includes(filtros.aba ?? "") ? filtros.aba! : "fila";
  function url(alteracoes: Record<string, string | null>) {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(filtros)) if (value && !["pagina", "status", "encerrados"].includes(key)) q.set(key, value);
    for (const [key, value] of Object.entries(alteracoes)) { if (value === null) q.delete(key); else q.set(key, value); }
    return `/chamados${q.size ? `?${q.toString()}` : ""}`;
  }
  const pagina = (p: number) => url({ pagina: String(p) });
  const abas = [
    { id: "fila", texto: "Em Fila", total: dados.counts.fila },
    { id: "aguardando", texto: "Aguardando Usuário", total: dados.counts.aguardando },
    { id: "pausa", texto: "Em Pausa", total: dados.counts.pausa },
  ];
  return <PageContainer>
    <PageHeader title="Chamados" subtitle="Acompanhe e gerencie chamados de suporte." action={<div className="group flex flex-wrap items-center gap-2"><BotaoFixarTela code="helpdesk" fixada={fixadas.includes("helpdesk")} />{podeAbrir(c.ctx, c.config) && <Button href="/chamados/novo">Novo chamado</Button>}{podeGerenciar(c.ctx, c.config) && <Button href="/chamados/configuracoes" variant="ghost">Configurar</Button>}</div>} />
    {!!dados.drafts.length && <Card className="mb-5 p-4"><h2 className="mb-2 font-semibold text-fg">Seus rascunhos</h2><div className="flex flex-wrap gap-2">{dados.drafts.map(d => <Button key={d.id} href={`/chamados/novo?rascunho=${d.id}`} variant="secondary" size="sm">{resumoRascunho(d.payload)}</Button>)}</div></Card>}
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Card className="min-w-64 flex-1 p-3"><ControlesBuscaChamados key={`${filtros.q ?? ""}:${filtros.prioridade ?? ""}`} /></Card>
      {internos && <Button href={url({ meus: filtros.meus === "1" ? null : "1", pagina: null })} variant={filtros.meus === "1" ? "primary" : "secondary"} aria-pressed={filtros.meus === "1"}>Atribuídos a mim</Button>}
    </div>
    <Accordion className="mb-5 rounded-lg border border-border bg-surface px-4 py-3" titulo="Mais filtros" classeDoCabecalho="w-full text-ui font-semibold text-fg" classeDoConteudo="pt-4">
      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" method="get">
        <input type="hidden" name="aba" value={aba} />
        {filtros.q && <input type="hidden" name="q" value={filtros.q} />}{filtros.prioridade && <input type="hidden" name="prioridade" value={filtros.prioridade} />}{filtros.meus === "1" && <input type="hidden" name="meus" value="1" />}
        <Select name="categoria" aria-label="Grupo e categoria" defaultValue={filtros.categoria ?? ""}><option value="">Todos os grupos e categorias</option>{cats.map(cat => <option key={cat.id} value={cat.id}>{caminhoDaCategoria(cats, cat.id)}</option>)}</Select>
        <Select name="setor" aria-label="Setor solicitante" defaultValue={filtros.setor ?? ""}><option value="">Todos os setores solicitantes</option>{setores.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}</Select>
        <Select name="responsavel" aria-label="Responsável" defaultValue={filtros.responsavel ?? ""}><option value="">Todos os responsáveis</option>{users.filter(u => u.sectors.some(s => s.sectorCode === c.config.sectorCode)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary">Aplicar</Button><Button href={url({ categoria: null, setor: null, responsavel: null, pagina: null })} variant="ghost">Limpar filtros</Button></div>
      </form>
    </Accordion>
    <nav aria-label="Filtrar chamados por situação" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2">
      <div className="flex flex-wrap gap-1 rounded-md bg-surface-hover p-1">{abas.map(item => <Link key={item.id} href={url({ aba: item.id, pagina: null })} aria-current={aba === item.id ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-ui font-semibold transition-colors ${aba === item.id ? "bg-surface text-fg shadow-xs" : "text-fg-secondary hover:text-fg"}`}>{item.texto}<span className="rounded bg-surface-hover px-1.5 py-0.5 text-helper">{item.total}</span></Link>)}</div>
      <Link href={url({ aba: "historico", pagina: null })} aria-current={aba === "historico" ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-ui font-semibold transition-colors ${aba === "historico" ? "bg-surface-hover text-fg" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"}`}>Histórico<span className="rounded bg-surface-hover px-1.5 py-0.5 text-helper">{dados.counts.historico}</span></Link>
    </nav>
    <p className="mb-3 text-helper text-fg-secondary">{dados.total} chamado(s) · página {dados.page}</p>
    {!dados.rows.length ? <Card className="p-8 text-center text-fg-secondary"><h2 className="font-semibold text-fg">Nenhum chamado neste recorte</h2><p className="mt-2 text-ui">Altere os filtros ou abra uma nova solicitação.</p></Card> : <div className="space-y-3">{dados.rows.map(t => {
      const setor = setores.find(s => s.code === t.requesterSectorCode);
      const corCategoria = corDaCategoria(t.categoryId);
      return <Card key={t.id} className="border-l-[3px] p-4" style={{ borderLeftColor: setor?.color ?? "#586577" }}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link href={`/chamados/${t.id}`} className="break-words text-label font-semibold text-brand hover:underline">{t.title}</Link><p className="mt-2 flex flex-wrap items-center gap-1.5 text-helper">
        <span aria-label="Grupo e categoria" className="inline-flex items-center rounded-md border px-2 py-0.5 font-medium" style={{ color: corCategoria, borderColor: `color-mix(in srgb, ${corCategoria} 32%, transparent)`, backgroundColor: `color-mix(in srgb, ${corCategoria} 10%, var(--c41-surface))` }}>{caminhoDaCategoria(cats, t.categoryId) || t.category.name}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5" style={{ color: setor?.color ?? "#586577", backgroundColor: `color-mix(in srgb, ${setor?.color ?? "#586577"} 10%, var(--c41-surface))` }}><span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: setor?.color ?? "#586577" }} />{setor?.label ?? t.requesterSectorCode}</span>
        <span className="text-fg-secondary">· {formatInstantDate(t.createdAt)}</span></p></div><div className="flex flex-wrap gap-2 text-helper"><span className="rounded bg-brand/8 px-2 py-1 text-brand">{ROTULOS[t.status]}</span><span className="rounded bg-surface-hover px-2 py-1 text-fg-secondary">{ROTULOS_PRIORIDADE[t.priority]}</span></div></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-helper text-fg-secondary"><span>{t.assignees.length ? t.assignees.map(a => nome(a.userId)).join(", ") : "Aguardando distribuição"}</span>{t.status === "NA_FILA" && <span>Posição {dados.posicoes.get(t.id)} de {dados.totalFila} na fila</span>}{t.cycles[0] && <span>Prazo: {formatInstantDate(t.cycles[0].resolutionDueAt)}{t.cycles[0].pausedAt ? " · SLA pausado" : ""}</span>}</div></Card>;
    })}</div>}
    <div className="mt-5 flex flex-wrap gap-2">{dados.page > 1 && <Button href={pagina(dados.page - 1)} variant="secondary">Anterior</Button>}{dados.page * 25 < dados.total && <Button href={pagina(dados.page + 1)} variant="secondary">Próxima página</Button>}</div>
  </PageContainer>;
}
