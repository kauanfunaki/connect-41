"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FolderGit2, GitCommitHorizontal, Lock, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonBlocks, SkeletonCardList, SkeletonMetrics } from "@/components/shared/SkeletonParts";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { formatInstantDateTime } from "@/lib/format";
import { githubFetch } from "@/lib/github/browser";
import { TYPE_LABELS, CONTRIBUTION_TYPES, type ContributionType, type DashboardView, type CalendarDay, type DayEvent, type HeatmapUser, type RepositoryHeatmap } from "@/lib/github/types";
import { dateLabel } from "@/lib/github/calendar";
import { corDaPessoa, COR_SEM_TIME, type ModoDeCor, type Paleta } from "@/lib/github/cores";
import { ContributionCalendar } from "./ContributionCalendar";
import { DeveloperAvatar, DeveloperName, GithubOverview, SeloDoTime } from "./GithubOverview";
import { GithubTimes } from "./GithubTimes";
import { CabecalhoDaProdutividade } from "@/components/produtividade/CabecalhoDaProdutividade";
import { ROTAS_DO_GITHUB } from "@/lib/tech-interno/rotasDaProdutividade";
import styles from "./GithubContributions.module.css";

export type View = "general" | "developers" | "repositories" | "teams";
// Dentro da Produtividade (05/11/2026); desde 06/11 os desenvolvedores e os times
// são a aba Pessoas, e o Geral é a aba GitHub, com os repositórios num botão.
const PATHS: Record<View, string> = ROTAS_DO_GITHUB;
const SUBTITLES: Record<View, string> = { general: "A atividade do time no GitHub. É contexto: commits e PRs ficam fora das contas de entrega.", developers: "Cada desenvolvedor, ou cada time, e as contribuições no GitHub.", repositories: "Repositórios conectados e a contribuição de cada desenvolvedor.",
  teams: "Monte os times e escolha a cor de cada pessoa e de cada time." };
const TYPE_SINGULAR: Record<ContributionType, string> = { COMMIT: "Commit", PULL_REQUEST: "Pull request", ISSUE: "Issue", REVIEW: "Revisão" };
// O dia aberto: de um desenvolvedor (aba Desenvolvedores) ou de um repositório (aba Repositórios).
// "team": o dia do calendário do time (aba Geral), com todas as pessoas do filtro.
type Detail = { kind: "user" | "repository" | "team"; id: string; day: string };

export function GithubContributions({ initialQuery: suppliedQuery, canConfigure, conectar = false, view = "general" }: { initialQuery: string; canConfigure: boolean; conectar?: boolean; view?: View }) {
  // A aba Times (04/11/2026) é só do coordenador e não lê o painel.
  if (view === "teams") return <GithubShell view={view} suppliedQuery={suppliedQuery} canConfigure={canConfigure} conectar={conectar}><GithubTimes /></GithubShell>;
  return <Dashboard initialQuery={suppliedQuery} canConfigure={canConfigure} conectar={conectar} view={view} />;
}

// Cabeçalho comum às quatro telas, sem segunda fileira de abas (06/11/2026): os
// desenvolvedores são a aba Pessoas e o Geral é a aba GitHub. Repositórios (do
// GitHub) e Times (de Pessoas, só para quem gerencia o módulo) abrem por botão
// e voltam por um "Voltar" — telas de dentro, não abas.
function GithubShell({ view, suppliedQuery, canConfigure, conectar, children }: { view: View; suppliedQuery: string; canConfigure: boolean; conectar: boolean; children: React.ReactNode }) {
  // O período e a busca vão junto ao trocar de tela.
  const params = new URLSearchParams(suppliedQuery); params.delete("page"); params.delete("view");
  const comParams = (path: string) => params.size ? `${path}?${params}` : path;
  const aba = view === "developers" || view === "teams" ? "pessoas" : "github";
  const acoes = <>
    {view === "general" && <Button href={comParams(PATHS.repositories)} variant="secondary"><FolderGit2 size={14} aria-hidden />Ver repositórios</Button>}
    {view === "repositories" && <Button href={comParams(PATHS.general)} variant="ghost"><ArrowLeft size={14} aria-hidden />Voltar ao GitHub</Button>}
    {view === "developers" && canConfigure && <Button href={PATHS.teams} variant="secondary"><UsersRound size={14} aria-hidden />Times e cores</Button>}
    {view === "teams" && <Button href={PATHS.developers} variant="ghost"><ArrowLeft size={14} aria-hidden />Voltar a Pessoas</Button>}
    {conectar && <Button href="/api/integrations/github/conta" nativo><Plus size={14} aria-hidden />Conectar GitHub</Button>}
  </>;
  return <PageContainer>
    <CabecalhoDaProdutividade aba={aba} subtitulo={SUBTITLES[view]} acao={<div className="flex flex-wrap gap-2">{acoes}</div>} />
    {children}
  </PageContainer>;
}

function Dashboard({ initialQuery: suppliedQuery, canConfigure, conectar, view }: { initialQuery: string; canConfigure: boolean; conectar: boolean; view: Exclude<View, "teams"> }) {
  // `cor` (pessoa ou time) só muda a pintura: sai da consulta para não reler o painel.
  const modo: ModoDeCor = new URLSearchParams(suppliedQuery).get("cor") === "time" ? "time" : "pessoa";
  const requestParams = new URLSearchParams(suppliedQuery); requestParams.set("view", view); requestParams.delete("cor");
  const initialQuery = requestParams.toString(), path = PATHS[view];
  const [data, setData] = useState<DashboardView | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [tentativa, setTentativa] = useState(0), [dates, setDates] = useState<{ from: string; to: string } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const openUserDay = useCallback((id: string, day: string) => setDetail({ kind: "user", id, day }), [setDetail]);
  const openRepositoryDay = useCallback((id: string, day: string) => setDetail({ kind: "repository", id, day }), [setDetail]);
  const openTeamDay = useCallback((id: string, day: string) => setDetail({ kind: "team", id, day }), [setDetail]);
  // Uma leitura por busca ou período, sem polling: o painel lê o acervo gravado e o
  // andamento da coleta fica em Integrações (26/10/2026).
  useEffect(() => {
    const controller = new AbortController(); const timer = window.setTimeout(() => {
      setLoading(true); setDetail(null); setData(null); setError(null);
      void githubFetch<DashboardView>(`/api/github?${initialQuery}`, undefined, controller.signal)
        .then(result => { if (!controller.signal.aborted) { setData(result); setDates({ from: result.from, to: result.to }); } })
        .catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [initialQuery, tentativa]);
  function pageHref(page: number) { const params = new URLSearchParams(initialQuery); params.delete("view"); params.set("page", String(page)); return `${path}?${params}`; }
  const params = new URLSearchParams(initialQuery);
  // Repositório, organização, tipo e robôs saíram da tela com a caixa de filtros (26/10/2026);
  // um link antigo com eles ainda filtra, e o Limpar aparece para desfazer.
  const filtered = ["user", "from", "to", "repository", "organization", "type", "all", "time"].some(key => params.has(key)) || params.get("bots") === "1";
  const detailUser = detail?.kind === "user" ? data?.users.find(item => item.id === detail.id) : undefined;
  const detailTitle = detailUser ? (detailUser.name ? `${detailUser.login} — ${detailUser.name}` : detailUser.login)
    : detail?.kind === "repository" ? data?.repositories.find(repo => repo.id === detail.id)?.fullName : detail?.kind === "team" ? "Todo o time" : undefined;
  // O título é o nome do módulo no menu; o Geral é a aba GitHub e os desenvolvedores, a aba Pessoas.
  return <GithubShell view={view} suppliedQuery={suppliedQuery} canConfigure={canConfigure} conectar={conectar}>
    {dates && !data?.message && <Toolbar path={path} query={suppliedQuery} from={dates.from} to={dates.to} modo={modo} times={data?.paleta.times ?? []} />}
    {error && <Aviso className="mb-4">{error}{!data && !loading && <> <Button variant="link" onClick={() => { setError(null); setTentativa(n => n + 1); }}>Tentar novamente</Button></>}</Aviso>}
    {loading && <div aria-busy><span className="sr-only" role="status">Carregando contribuições…</span>{view === "general" ? <><SkeletonMetrics /><SkeletonBlocks blocos={2} /></> : <SkeletonCardList cards={3} />}</div>}
    {data?.message && !loading && <Aviso tom="atencao" className="mb-4">{data.message}{canConfigure && <> <Link href="/admin/integracoes?integracao=github" className="font-medium underline">Abrir Integrações</Link></>}</Aviso>}
    {data && !data.message && !loading && <>
      {!data.all && !data.linked && <Aviso tom="info" className="mb-4">Ninguém vinculou a conta GitHub ainda, por isso o painel está vazio. Cada pessoa do Tech vincula a sua em <Link href="/configuracoes#github" className="font-medium underline">Sua conta</Link>.</Aviso>}
      {view === "general" ? <GithubOverview data={data} query={suppliedQuery} modo={modo} onDay={openTeamDay} />
        : view === "developers" ? <Developers data={data} filtered={filtered} canConfigure={canConfigure} onDay={openUserDay} pageHref={pageHref} modo={modo} />
          : <Repositories data={data} onDay={openRepositoryDay} pageHref={pageHref} modo={modo} />}
    </>}
    {detail && detailTitle && data && !loading && <DayDetails key={`${detail.kind}:${detail.id}:${detail.day}`} detail={detail} title={detailTitle} query={initialQuery} timezone={data.timezone} onClose={() => setDetail(null)} />}
  </GithubShell>;
}

function Developers({ data, filtered, onDay, pageHref, modo }: { data: DashboardView; filtered: boolean; canConfigure: boolean; onDay: (id: string, day: string) => void; pageHref: (page: number) => string; modo: ModoDeCor }) {
  const times = modo === "time" ? timesDaPagina(data.users, data.paleta) : [];
  return <>
    <div className={styles.listHeading}><span>{modo === "time" ? `${times.length} ${times.length === 1 ? "time" : "times"} · ` : ""}{data.totalUsers} desenvolvedores · {Number(data.total).toLocaleString("pt-BR")} contribuições</span></div>
    <div className={styles.developerList}>
      {!data.users.length ? <Card><EmptyState icon={<GitCommitHorizontal />} title="Nenhum desenvolvedor encontrado" description={filtered ? "Ajuste a busca ou o período para ver outros desenvolvedores." : undefined} /></Card>
        : modo === "time" ? times.map(time => <TeamCard key={time.id} time={time} from={data.from} to={data.to} paleta={data.paleta} />)
        : data.users.map(user => <DeveloperCard key={user.id} user={user} from={data.from} to={data.to} onDay={onDay} paleta={data.paleta} modo={modo} />)}
    </div>
    <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.totalUsers / data.pageSize))} buildHref={pageHref} total={data.totalUsers} rotulo="desenvolvedores" />
  </>;
}

// "Por time" (05/11/2026): um card por time, somando os desenvolvedores dele
// nesta página; quem está sem time vira o card "Sem time".
type TimeNoPainel = { id: string; nome: string; cor: string; users: HeatmapUser[]; total: number; activeDays: number; counts: Record<ContributionType, number>; days: CalendarDay[] };
function timesDaPagina(users: HeatmapUser[], paleta: Paleta): TimeNoPainel[] {
  const grupos = new Map<string, HeatmapUser[]>();
  for (const user of users) { const id = paleta.pessoas[user.id]?.time ?? ""; grupos.set(id, [...(grupos.get(id) ?? []), user]); }
  return [...grupos].map(([id, membros]) => {
    const time = paleta.times.find(item => item.id === id), porDia = new Map<string, CalendarDay>();
    for (const user of membros) for (const d of user.days) {
      const dia = porDia.get(d.day) ?? { day: d.day, count: 0, parts: [] };
      dia.count += d.count; dia.parts!.push([user.id, d.count]); porDia.set(d.day, dia);
    }
    const counts = Object.fromEntries(CONTRIBUTION_TYPES.map(type => [type, membros.reduce((s, u) => s + u.counts[type], 0)])) as Record<ContributionType, number>;
    return { id: id || "sem-time", nome: time?.nome ?? "Sem time", cor: time?.cor ?? COR_SEM_TIME, users: membros, total: membros.reduce((s, u) => s + u.total, 0),
      activeDays: porDia.size, counts, days: [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day)) };
  }).sort((a, b) => (a.id === "sem-time" ? 1 : 0) - (b.id === "sem-time" ? 1 : 0) || b.total - a.total);
}
function TeamCard({ time, from, to, paleta }: { time: TimeNoPainel; from: string; to: string; paleta: Paleta }) {
  return <section className={styles.developer}>
    <div className={styles.developerHeading}><div className={styles.developerIdentity}>
      <SeloDoTime nome={time.nome} cor={time.cor} />
      <div><h2 title={time.users.map(u => u.name ?? u.login).join(", ")}>{time.nome}</h2>
        <p>{time.users.length} {time.users.length === 1 ? "desenvolvedor" : "desenvolvedores"} · {Number(time.total).toLocaleString("pt-BR")} contribuições · {time.activeDays} dias com atividade</p></div></div>
      <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{time.counts[type]}</strong></span>)}</div>
    </div>
    <ContributionCalendar label={time.nome} id={time.id} from={from} to={to} days={time.days} onDay={() => {}} paleta={paleta} modo="time" />
  </section>;
}

function DeveloperCard({ user, from, to, onDay, paleta, modo }: { user: HeatmapUser; from: string; to: string; onDay: (id: string, day: string) => void; paleta: Paleta; modo: ModoDeCor }) {
  const time = paleta.times.find(item => item.id === paleta.pessoas[user.id]?.time);
  return <section className={styles.developer}>
    <div className={styles.developerHeading}><div className={styles.developerIdentity}><DeveloperAvatar login={user.login} /><div><h2><DeveloperName login={user.login} name={user.name} />{user.isBot && <span className="ml-2 text-helper font-normal text-fg-muted">Robô (bot)</span>}</h2>
      <p>{time && <><span className={styles.swatch} style={{ "--swatch": time.cor } as React.CSSProperties}>{time.nome}</span> · </>}{Number(user.total).toLocaleString("pt-BR")} contribuições · {user.activeDays} dias com atividade</p></div></div>
      <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{user.counts[type]}</strong></span>)}</div>
    </div>
    <ContributionCalendar label={user.login} id={user.id} from={from} to={to} days={user.days} onDay={onDay} paleta={paleta} modo={modo} pessoa={user.id} />
  </section>;
}

// Aba Repositórios (27/10/2026): o calendário de cada repositório conectado e, ao lado,
// quanto cada desenvolvedor contribuiu nele no período.
function Repositories({ data, onDay, pageHref, modo }: { data: DashboardView; onDay: (id: string, day: string) => void; pageHref: (page: number) => string; modo: ModoDeCor }) {
  return <>
    <div className={styles.listHeading}><span>{data.totalRepositories} repositórios · {Number(data.total).toLocaleString("pt-BR")} contribuições</span></div>
    <div className={styles.developerList}>
      {!data.repositories.length ? <Card><EmptyState icon={<FolderGit2 />} title="Nenhum repositório encontrado" /></Card>
        : data.repositories.map(repo => <RepositoryCard key={repo.id} repo={repo} from={data.from} to={data.to} onDay={onDay} paleta={data.paleta} modo={modo} />)}
    </div>
    <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.totalRepositories / data.pageSize))} buildHref={pageHref} total={data.totalRepositories} rotulo="repositórios" />
  </>;
}

function RepositoryCard({ repo, from, to, onDay, paleta, modo }: { repo: RepositoryHeatmap; from: string; to: string; onDay: (id: string, day: string) => void; paleta: Paleta; modo: ModoDeCor }) {
  const top = repo.contributors[0]?.total ?? 0;
  return <section className={styles.developer}>
    <div className={styles.developerHeading}><div className={styles.developerIdentity}><span aria-hidden className={styles.avatar}><FolderGit2 size={16} /></span><div>
      <h2>{repo.fullName}{repo.private && <Lock size={13} aria-label="Privado" className="ml-2 inline align-baseline text-fg-muted" />}</h2>
      <p>{Number(repo.total).toLocaleString("pt-BR")} contribuições · {repo.activeDays} dias com atividade · {repo.contributors.length} {repo.contributors.length === 1 ? "desenvolvedor" : "desenvolvedores"}</p></div></div>
      <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{repo.counts[type]}</strong></span>)}</div>
    </div>
    <div className={styles.repositoryBody}>
      <ContributionCalendar label={repo.fullName} id={repo.id} from={from} to={to} days={repo.days} onDay={onDay} paleta={paleta} modo={modo} />
      <div className={styles.contributors} aria-label={`Contribuições por desenvolvedor em ${repo.fullName}`}>
        <h3>Por desenvolvedor</h3>
        {!repo.contributors.length ? <p className="text-helper text-fg-muted">Nenhuma contribuição no período.</p>
          : repo.contributors.map(person => <div key={person.id} className={styles.contributor}
            title={CONTRIBUTION_TYPES.map(type => `${TYPE_LABELS[type]}: ${person.counts[type]}`).join(" · ")}>
            <DeveloperAvatar login={person.login} />
            <span className={styles.contributorName}><DeveloperName login={person.login} name={person.name} /></span>
            <strong className="tabular-nums">{Number(person.total).toLocaleString("pt-BR")}</strong>
            <span aria-hidden className={styles.contributorBar}><span style={{ width: `${top ? Math.max(4, person.total / top * 100) : 0}%`, "--bar-color": corDaPessoa(person.id, paleta, modo) } as React.CSSProperties} /></span>
          </div>)}
      </div>
    </div>
  </section>;
}

// Busca e período se aplicam sozinhos, sem "Aplicar filtros" (26/10/2026): a busca
// espera 300 ms de pausa na digitação, como as outras buscas do Connect.
// "Mostrar todos" inclui quem não vinculou a conta; clicar de novo volta aos integrados (27/10/2026).
function Toolbar({ path, query, from, to, modo, times }: { path: string; query: string; from: string; to: string; modo: ModoDeCor; times: { id: string; nome: string }[] }) {
  const router = useRouter(), [user, setUser] = useState(() => new URLSearchParams(query).get("user") ?? ""), sent = useRef(user.trim());
  const [period, setPeriod] = useState({ from, to }), [resolved, setResolved] = useState({ from, to });
  const time = new URLSearchParams(query).get("time") ?? "";
  // O período devolvido pelo servidor (o padrão de 12 meses, depois de Limpar) volta aos campos.
  if (resolved.from !== from || resolved.to !== to) { setResolved({ from, to }); setPeriod({ from, to }); }
  const apply = useCallback((next: { user: string; from?: string; to?: string; all?: boolean; cor?: ModoDeCor; time?: string }) => {
    const current = new URLSearchParams(query), params = new URLSearchParams();
    sent.current = next.user;
    if (next.user) params.set("user", next.user);
    for (const key of ["from", "to"] as const) { const value = next[key] ?? current.get(key); if (value) params.set(key, value); }
    if (next.all ?? current.get("all") === "1") params.set("all", "1");
    if ((next.cor ?? current.get("cor")) === "time") params.set("cor", "time");
    const time = next.time ?? current.get("time"); if (time) params.set("time", time);
    const suffix = params.toString(); router.replace(`${path}${suffix ? `?${suffix}` : ""}`, { scroll: false });
  }, [path, query, router]);
  useEffect(() => {
    const value = user.trim(); if (value === sent.current) return;
    const timer = window.setTimeout(() => apply({ user: value }), 300);
    return () => window.clearTimeout(timer);
  }, [user, apply]);
  function changeDate(key: "from" | "to", value: string) {
    const next = { ...period, [key]: value }; setPeriod(next);
    if (next.from && next.to && next.from <= next.to) apply({ user: user.trim(), from: next.from, to: next.to });
  }
  return <div role="search" className={styles.toolbar}>
    <label className={styles.dateField}><span>De</span><CampoData aria-label="De" value={period.from} max={period.to || undefined} onChange={value => changeDate("from", value)} /></label>
    <label className={styles.dateField}><span>Até</span><CampoData aria-label="Até" value={period.to} min={period.from || undefined} onChange={value => changeDate("to", value)} /></label>
    {/* A busca por pessoa fica fora da aba Geral (05/11/2026). */}
    {path !== PATHS.general && <label className="min-w-0 flex-1 basis-48"><span className="sr-only">Buscar desenvolvedor</span><CampoDeBusca aria-label="Buscar desenvolvedor" placeholder="Buscar desenvolvedor…" value={user} enviarAoLimpar={false}
      onChange={event => setUser(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && user.trim() !== sent.current) apply({ user: user.trim() }); }} /></label>}
    {/* Um campo só (05/11/2026): agrupa por pessoa ou por time, e escolhe um time. */}
    <label className="flex flex-col gap-1 text-helper text-fg-secondary"><span>Agrupar por</span>
      <Select aria-label="Agrupar por" value={modo === "time" ? (time ? `time:${time}` : "time") : "pessoa"}
        onChange={event => { const v = event.target.value; apply({ user: user.trim(), cor: v === "pessoa" ? "pessoa" : "time", time: v.startsWith("time:") ? v.slice(5) : "" }); }}>
        <option value="pessoa">Pessoas</option>
        <option value="time">Times · todos</option>
        {times.map(item => <option key={item.id} value={`time:${item.id}`}>{item.nome}</option>)}
      </Select>
    </label>
  </div>;
}

function DayDetails({ detail, title, query, timezone, onClose }: { detail: Detail; title: string; query: string; timezone: string; onClose: () => void }) {
  const [page, setPage] = useState(1), [result, setResult] = useState<{ events: DayEvent[]; total: number; pageSize: number } | null>(null), [error, setError] = useState<string | null>(null);
  // O detalhe do dia só é consultado ao abrir, nunca junto com os calendários.
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams(query);
    if (detail.kind === "team") params.set("team", "1"); else params.set(detail.kind === "user" ? "userId" : "repository", detail.id);
    params.set("day", detail.day); params.set("page", String(page));
    void githubFetch<{ events: DayEvent[]; total: number; pageSize: number }>(`/api/github/events?${params}`, undefined, controller.signal).then(next => { setResult(next); setError(null); }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [detail, query, page]);
  return <Modal open onClose={onClose} title={`${title} · ${dateLabel(detail.day)}`} maxWidth="max-w-3xl">
    <div className="space-y-3 pt-3">{error && <Aviso>{error}</Aviso>}
      {!result && !error && <p className="text-ui text-fg-muted" role="status">Carregando atividades…</p>}
      {result && <><p className="text-helper text-fg-muted">{result.total} atividades</p>{result.events.map(event => <a key={event.id} href={event.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-border p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-ui font-medium text-fg"><code className={styles.eventCode}>{event.reference}</code><span className="min-w-0 break-words">{event.title ?? TYPE_SINGULAR[event.type]}</span></p>
        <p className="mt-1 break-all text-helper text-fg-muted">{TYPE_SINGULAR[event.type]} · {event.repository}{detail.kind !== "user" && <> · <DeveloperName login={event.login} name={event.name} /></>} · {formatInstantDateTime(new Date(event.occurredAt), { timeZone: timezone })} · Abrir no GitHub ↗</p>
      </a>)}
        {!result.events.length && <EmptyState icon={<GitCommitHorizontal />} title="Nenhuma contribuição neste dia" />}
        {result.total > result.pageSize && <div className="flex items-center justify-between gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-ui text-fg-muted tabular-nums">Página {page} de {Math.ceil(result.total / result.pageSize)}</span><Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
      </>}
    </div>
  </Modal>;
}
