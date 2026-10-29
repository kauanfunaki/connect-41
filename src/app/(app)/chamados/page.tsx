import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { BellRing, History, Hourglass, Inbox, CirclePause, Plus, Settings, Ticket } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ControlesBuscaChamados } from "@/components/chamados/ControlesBuscaChamados";
import { MoverNaFila } from "@/components/chamados/MoverNaFila";
import { RascunhoDaLista } from "@/components/chamados/RascunhoDaLista";
import { contexto } from "@/lib/chamados/contexto";
import { podeAbrir, podeGerenciar, podeVerInterno, escoposDaBusca } from "@/lib/chamados/acesso";
import { lista, categorias, usuarios, resumoRascunho } from "@/lib/chamados/consultas";
import { getActiveSectors } from "@/lib/sectors";
import { ROTULOS, ROTULOS_PRIORIDADE, aguardandoSolicitante } from "@/lib/chamados/regras";
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
  // Quem não é da equipe responsável nem administrador (27/10/2026) não vê as
  // abas de atendimento: acompanha os próprios chamados (o gestor, os do setor)
  // em "Abertos", com destaque nos que esperam a resposta dele.
  const internos = podeVerInterno(c.ctx, c.config), reordenar = internos && podeGerenciar(c.ctx, c.config);
  const abasValidas = internos ? ["fila", "aguardando", "pausa", "historico"] : ["abertos", "historico"];
  const aba = abasValidas.includes(filtros.aba ?? "") ? filtros.aba! : abasValidas[0];
  const [dados, cats, users, setores] = await Promise.all([lista(c, { ...filtros, aba }), categorias(c, true), usuarios(c), getActiveSectors(c.ctx.tenantId)]);
  if (!podeAbrir(c.ctx, c.config) && !podeVerInterno(c.ctx, c.config) && !dados.total && !dados.drafts.length) {
    const anteriores = await lista(c, { aba: "historico" }); if (!anteriores.total) notFound();
  }
  const nome = (id: string) => users.find(u => u.id === id)?.name ?? "Usuário indisponível";
  const fixadas = await codigosDeTelasFixadas(c.ctx.userId, c.ctx.tenantId);
  function url(alteracoes: Record<string, string | null>) {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(filtros)) if (value && !["pagina", "status", "encerrados"].includes(key)) q.set(key, value);
    for (const [key, value] of Object.entries(alteracoes)) { if (value === null) q.delete(key); else q.set(key, value); }
    return `/chamados${q.size ? `?${q.toString()}` : ""}`;
  }
  const pagina = (p: number) => url({ pagina: String(p) });
  const abas = internos ? [
    { id: "fila", texto: "Em Fila", total: dados.counts.fila, Icone: Inbox },
    { id: "aguardando", texto: "Aguardando Usuário", total: dados.counts.aguardando, Icone: Hourglass },
    { id: "pausa", texto: "Em Pausa", total: dados.counts.pausa, Icone: CirclePause },
  ] : [{ id: "abertos", texto: "Abertos", total: dados.counts.abertos, Icone: Ticket }];
  return <PageContainer>
    <PageHeader title="Chamados" subtitle={internos ? "Acompanhe e gerencie chamados de suporte." : c.ctx.role === "SECTOR_ADMIN" ? "Acompanhe os chamados que você e o seu setor abriram." : "Acompanhe os chamados que você abriu."} action={<div className="group flex flex-wrap items-center gap-2"><BotaoFixarTela code="helpdesk" fixada={fixadas.includes("helpdesk")} />{internos && podeGerenciar(c.ctx, c.config) && <IconButton href="/chamados/configuracoes" variant="framed" size="lg" title="Configurar chamados"><Settings size={16} /></IconButton>}{podeAbrir(c.ctx, c.config) && <Button href="/chamados/novo"><Plus size={14} aria-hidden />Novo chamado</Button>}</div>} />
    {!!dados.drafts.length && <Card className="mb-5 p-4"><h2 className="mb-2 font-semibold text-fg">Seu rascunho</h2><div className="flex flex-wrap gap-2">{dados.drafts.map(d => <RascunhoDaLista key={d.id} id={d.id} titulo={resumoRascunho(d.payload)} />)}</div></Card>}
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Card className="min-w-64 flex-1 p-3"><ControlesBuscaChamados key={`${filtros.q ?? ""}:${filtros.em ?? ""}`} atribuidos={internos} escopos={escoposDaBusca(c.ctx, c.config)} /></Card>
    </div>
    <nav aria-label="Filtrar chamados por situação" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2">
      <div className="flex flex-wrap gap-1 rounded-md bg-surface-hover p-1">{abas.map(item => <Link key={item.id} href={url({ aba: item.id, pagina: null })} aria-current={aba === item.id ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-ui font-semibold transition-colors ${aba === item.id ? "bg-surface text-fg shadow-xs" : "text-fg-secondary hover:text-fg"}`}><item.Icone size={14} aria-hidden className="shrink-0" />{item.texto}<span className="rounded bg-surface-hover px-1.5 py-0.5 text-helper">{item.total}</span></Link>)}</div>
      <Link href={url({ aba: "historico", pagina: null })} aria-current={aba === "historico" ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-ui font-semibold transition-colors ${aba === "historico" ? "bg-surface-hover text-fg" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"}`}><History size={14} aria-hidden className="shrink-0" />Histórico<span className="rounded bg-surface-hover px-1.5 py-0.5 text-helper">{dados.counts.historico}</span></Link>
    </nav>
    {!internos && !!dados.counts.aguardando && <Link href={url({ aba: "abertos", pagina: null })} className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-ui font-semibold text-warning-fg hover:bg-warning/15"><BellRing size={16} aria-hidden className="shrink-0" />{dados.counts.aguardando === 1 ? "1 chamado aguarda a sua resposta." : `${dados.counts.aguardando} chamados aguardam a sua resposta.`}</Link>}
    <p className="mb-3 text-helper text-fg-secondary">{dados.total} chamado(s) · página {dados.page}</p>
    {!dados.rows.length ? <Card className="p-8 text-center text-fg-secondary"><h2 className="font-semibold text-fg">Nenhum chamado neste recorte</h2><p className="mt-2 text-ui">Altere os filtros ou abra uma nova solicitação.</p></Card> : <div className="space-y-3">{dados.rows.map(t => {
      const setor = setores.find(s => s.code === t.requesterSectorCode);
      const corCategoria = corDaCategoria(t.categoryId);
      const posicao = dados.posicoes.get(t.id);
      const suaVez = !internos && aguardandoSolicitante(t.status);
      return <Card key={t.id} className={`relative flex gap-2 border-l-[3px] p-4 transition-colors hover:bg-surface-hover/40 ${suaVez ? "bg-warning/5 ring-2 ring-warning/60" : ""}`} style={{ borderLeftColor: setor?.color ?? "#586577" }}>{reordenar && t.status === "NA_FILA" && posicao && <div className="relative z-10"><MoverNaFila id={t.id} version={t.version} posicao={posicao} total={dados.totalFila} titulo={t.title} /></div>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link href={`/chamados/${t.id}`} className="break-words text-label font-semibold text-brand after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:underline">{t.title}</Link><p className="mt-2 flex flex-wrap items-center gap-1.5 text-helper">
        <span aria-label="Grupo e categoria" className="inline-flex items-center rounded-md border px-2 py-0.5 font-medium" style={{ color: corCategoria, borderColor: `color-mix(in srgb, ${corCategoria} 32%, transparent)`, backgroundColor: `color-mix(in srgb, ${corCategoria} 10%, var(--c41-surface))` }}>{caminhoDaCategoria(cats, t.categoryId) || t.category.name}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5" style={{ color: setor?.color ?? "#586577", backgroundColor: `color-mix(in srgb, ${setor?.color ?? "#586577"} 10%, var(--c41-surface))` }}><span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: setor?.color ?? "#586577" }} />{setor?.label ?? t.requesterSectorCode}</span>
        <span className="text-fg-secondary">· {formatInstantDate(t.createdAt)}</span></p></div><div className="flex flex-wrap gap-2 text-helper">{suaVez ? <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-2 py-1 font-semibold text-warning-fg"><BellRing size={12} aria-hidden />Aguardando sua resposta</span> : <span className="rounded bg-brand/8 px-2 py-1 text-brand">{ROTULOS[t.status]}</span>}<span className="rounded bg-surface-hover px-2 py-1 text-fg-secondary">{ROTULOS_PRIORIDADE[t.priority]}</span></div></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-helper text-fg-secondary">{t.assignees.length > 0 && <span aria-label={`Responsáveis: ${t.assignees.map(a => nome(a.userId)).join(", ")}`} className="flex -space-x-1.5">{t.assignees.map(a => { const partes = nome(a.userId).trim().split(/\s+/).filter(p => !/^(d[aeo]s?|e)$/i.test(p)); const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? ""); return <span key={a.userId} title={nome(a.userId)} aria-hidden className="flex size-7 items-center justify-center rounded-full bg-brand-subtle text-helper font-semibold uppercase text-brand ring-2 ring-surface">{ini}</span>; })}</span>}{t.status === "NA_FILA" && <span>Posição {posicao} de {dados.totalFila} na fila</span>}{t.cycles[0] && <span>Prazo: {formatInstantDate(t.cycles[0].resolutionDueAt)}{t.cycles[0].pausedAt ? " · SLA pausado" : ""}</span>}</div></div></Card>;
    })}</div>}
    <div className="mt-5 flex flex-wrap gap-2">{dados.page > 1 && <Button href={pagina(dados.page - 1)} variant="secondary">Anterior</Button>}{dados.page * 25 < dados.total && <Button href={pagina(dados.page + 1)} variant="secondary">Próxima página</Button>}</div>
  </PageContainer>;
}
