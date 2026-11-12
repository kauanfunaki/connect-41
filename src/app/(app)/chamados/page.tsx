import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { BellRing, History, Hourglass, Inbox, CirclePause, Plus, Settings, Ticket } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ControlesBuscaChamados } from "@/components/chamados/ControlesBuscaChamados";
import { CartaoDoChamado } from "@/components/chamados/CartaoDoChamado";
import { RascunhoDaLista } from "@/components/chamados/RascunhoDaLista";
import { contexto } from "@/lib/chamados/contexto";
import { podeAbrir, podeGerenciar, podeGerenciarNo, podeVerInterno, escoposDaBusca } from "@/lib/chamados/acesso";
import { lista, categorias, usuarios, resumoRascunho } from "@/lib/chamados/consultas";
import { getActiveSectors } from "@/lib/sectors";
import { aguardandoSolicitante } from "@/lib/chamados/regras";
import { slaAtrasado } from "@/lib/chamados/tons";
import { atividadesRecentes } from "@/lib/chamados/atividade";
import { isFullWrite } from "@/lib/auth/papeis";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
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
  // Quem conta como "Suporte" no log do cartão: a equipe do setor responsável e o administrador.
  const equipe = new Set(users.filter(u => isFullWrite(u.role) || u.sectors.some(s => c.config.sectorCodes.includes(s.sectorCode))).map(u => u.id));
  // Com mais de um setor administrando (12/11/2026), o cartão diz qual atende.
  const variosSetores = c.config.sectorCodes.length > 1;
  const agora = new Date();
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
    {/* As abas do app (`AbasDeLink`, regra de 30/09: aba troca a tela e tem a
        barra embaixo) no lugar da fileira de pílulas montada aqui (auditoria de
        UX, 30/10/2026). O Histórico entra na mesma fileira, por último. */}
    <AbasDeLink aria-label="Filtrar chamados por situação" ativa={aba} abas={[
      ...abas.map(item => ({ chave: item.id, rotulo: item.texto, href: url({ aba: item.id, pagina: null }), icone: <item.Icone size={14} aria-hidden />, contagem: item.total })),
      { chave: "historico", rotulo: "Histórico", href: url({ aba: "historico", pagina: null }), icone: <History size={14} aria-hidden />, contagem: dados.counts.historico },
    ]} />
    {!internos && !!dados.counts.aguardando && <Link href={url({ aba: "abertos", pagina: null })} className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-ui font-semibold text-warning-fg hover:bg-warning/15"><BellRing size={16} aria-hidden className="shrink-0" />{dados.counts.aguardando === 1 ? "1 chamado aguarda a sua resposta." : `${dados.counts.aguardando} chamados aguardam a sua resposta.`}</Link>}
    <p className="mb-3 text-helper text-fg-secondary tabular-nums">{dados.total === 1 ? "1 chamado" : `${dados.total} chamados`}</p>
    {!dados.rows.length ? <Card><EmptyState icon={<Ticket />} title="Nenhum chamado neste recorte" description={podeAbrir(c.ctx, c.config) ? "Troque a aba ou a busca, ou abra um chamado novo." : "Troque a aba ou a busca."} action={podeAbrir(c.ctx, c.config) ? <Button href="/chamados/novo" variant="secondary"><Plus size={14} aria-hidden />Novo chamado</Button> : undefined} /></Card> : <div className="space-y-3">{dados.rows.map(t => {
      const setor = setores.find(s => s.code === t.requesterSectorCode);
      const posicao = dados.posicoes.get(t.id);
      const autoria = { createdById: t.createdById, responsaveis: t.assignees.map(a => a.userId), equipe };
      return <CartaoDoChamado key={t.id} id={t.id} numero={t.number} titulo={t.title} status={t.status} prioridade={t.priority} version={t.version} criadoEm={t.createdAt}
        categoria={caminhoDaCategoria(cats, t.categoryId) || t.category.name} corCategoria={corDaCategoria(t.categoryId)}
        setor={{ rotulo: setor?.label ?? t.requesterSectorCode, cor: setor?.color ?? "var(--c41-fg-muted)" }}
        responsaveis={t.assignees.map(a => ({ id: a.userId, nome: nome(a.userId) }))}
        atende={variosSetores ? setores.find(s => s.code === t.handlingSectorCode)?.label ?? t.handlingSectorCode : undefined}
        prazo={t.cycles[0] ? { vence: t.cycles[0].resolutionDueAt, pausado: !!t.cycles[0].pausedAt, atrasado: slaAtrasado(t.status, t.cycles[0], agora) } : undefined}
        fila={t.status === "NA_FILA" && posicao ? { posicao, total: dados.totalFila.get(t.handlingSectorCode) ?? posicao, reordenar: reordenar && podeGerenciarNo(c.ctx, c.config, t.handlingSectorCode) } : undefined}
        atividades={atividadesRecentes(t.events, autoria, nome, dados.comentarios)} ultimaAtividade={t.events[0]?.createdAt ?? t.updatedAt}
        suaVez={!internos && aguardandoSolicitante(t.status)} agora={agora} />;
    })}</div>}
    <Pagination page={dados.page} totalPages={Math.max(1, Math.ceil(dados.total / 25))} buildHref={pagina} total={dados.total} rotulo="chamados" />
  </PageContainer>;
}
