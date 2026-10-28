"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderGit2, GitCommitHorizontal, LayoutGrid, Lock, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonBlocks, SkeletonCardList, SkeletonMetrics } from "@/components/shared/SkeletonParts";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoData } from "@/components/ui/CampoData";
import { formatInstantDateTime } from "@/lib/format";
import { githubFetch } from "@/lib/github/browser";
import { TYPE_LABELS, CONTRIBUTION_TYPES, type ContributionType, type DashboardView, type DayEvent, type HeatmapUser, type RepositoryHeatmap } from "@/lib/github/types";
import { dateLabel } from "@/lib/github/calendar";
import { ContributionCalendar } from "./ContributionCalendar";
import { DeveloperAvatar, DeveloperName, GithubOverview } from "./GithubOverview";
import styles from "./GithubContributions.module.css";

const INTEGRATION = "/admin/integracoes?integracao=github";
type View = "general" | "developers" | "repositories";
const PATHS: Record<View, string> = { general: "/github", developers: "/github/desenvolvedores", repositories: "/github/repositorios" };
const SUBTITLES: Record<View, string> = { general: "Acompanhe a atividade do time no GitHub.", developers: "Desenvolvedores e suas contribuições.", repositories: "Repositórios conectados e a contribuição de cada desenvolvedor." };
const TYPE_SINGULAR: Record<ContributionType, string> = { COMMIT: "Commit", PULL_REQUEST: "Pull request", ISSUE: "Issue", REVIEW: "Revisão" };
// O dia aberto: de um desenvolvedor (aba Desenvolvedores) ou de um repositório (aba Repositórios).
type Detail = { kind: "user" | "repository"; id: string; day: string };

export function GithubContributions({ initialQuery: suppliedQuery, canConfigure, view = "general" }: { initialQuery: string; canConfigure: boolean; view?: View }) {
  const requestParams = new URLSearchParams(suppliedQuery); requestParams.set("view", view);
  const initialQuery = requestParams.toString(), path = PATHS[view];
  const [data, setData] = useState<DashboardView | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [tentativa, setTentativa] = useState(0), [dates, setDates] = useState<{ from: string; to: string } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const openUserDay = useCallback((id: string, day: string) => setDetail({ kind: "user", id, day }), [setDetail]);
  const openRepositoryDay = useCallback((id: string, day: string) => setDetail({ kind: "repository", id, day }), [setDetail]);
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
  const tabParams = new URLSearchParams(suppliedQuery); tabParams.delete("page"); tabParams.delete("view");
  // Repositório, organização, tipo e robôs saíram da tela com a caixa de filtros (26/10/2026);
  // um link antigo com eles ainda filtra, e o Limpar aparece para desfazer.
  const filtered = ["user", "from", "to", "repository", "organization", "type", "all"].some(key => params.has(key)) || params.get("bots") === "1";
  const detailUser = detail?.kind === "user" ? data?.users.find(item => item.id === detail.id) : undefined;
  const detailTitle = detailUser ? (detailUser.name ? `${detailUser.login} — ${detailUser.name}` : detailUser.login)
    : detail?.kind === "repository" ? data?.repositories.find(repo => repo.id === detail.id)?.fullName : undefined;
  // O título é o nome do módulo no menu; Geral, Desenvolvedores e Repositórios são abas dele.
  return <PageContainer>
    <PageHeader title="GitHub — Contribuições" subtitle={SUBTITLES[view]}
      action={canConfigure ? <IconButton href={INTEGRATION} title="Integração GitHub" variant="framed"><Settings2 size={16} /></IconButton> : undefined} />
    <AbasDeLink className="mb-6" aria-label="GitHub" ativa={view} abas={[
      { chave: "general", rotulo: "Geral", href: `/github?${tabParams}`, icone: <LayoutGrid /> },
      { chave: "developers", rotulo: "Desenvolvedores", href: `/github/desenvolvedores?${tabParams}`, icone: <Users /> },
      { chave: "repositories", rotulo: "Repositórios", href: `/github/repositorios?${tabParams}`, icone: <FolderGit2 /> },
    ]} />
    {dates && !data?.message && <Toolbar path={path} query={suppliedQuery} from={dates.from} to={dates.to} filtered={filtered} />}
    {error && <Aviso className="mb-4">{error}{!data && !loading && <> <Button variant="link" onClick={() => { setError(null); setTentativa(n => n + 1); }}>Tentar novamente</Button></>}</Aviso>}
    {loading && <div aria-busy><span className="sr-only" role="status">Carregando contribuições…</span>{view === "general" ? <><SkeletonMetrics /><SkeletonBlocks blocos={2} /></> : <SkeletonCardList cards={3} />}</div>}
    {data?.message && !loading && <Aviso tom="atencao" className="mb-4">{data.message}{canConfigure && <> <Link href={INTEGRATION} className="font-medium underline">Abrir Integrações</Link></>}</Aviso>}
    {data && !data.message && !loading && <>
      {!data.all && !data.linked && <Aviso tom="info" className="mb-4">Ninguém vinculou a conta GitHub ainda, por isso o painel está vazio. Cada pessoa do Tech vincula a sua em <Link href="/configuracoes#github" className="font-medium underline">Sua conta</Link>; enquanto isso, use <strong>Mostrar todos</strong>.</Aviso>}
      {view === "general" ? <GithubOverview data={data} query={suppliedQuery} />
        : view === "developers" ? <Developers data={data} filtered={filtered} canConfigure={canConfigure} onDay={openUserDay} pageHref={pageHref} />
          : <Repositories data={data} onDay={openRepositoryDay} pageHref={pageHref} />}
      {data.unidentified > 0 && <Unidentified data={data} />}
    </>}
    {detail && detailTitle && data && !loading && <DayDetails key={`${detail.kind}:${detail.id}:${detail.day}`} detail={detail} title={detailTitle} query={initialQuery} timezone={data.timezone} onClose={() => setDetail(null)} />}
  </PageContainer>;
}

function Developers({ data, filtered, canConfigure, onDay, pageHref }: { data: DashboardView; filtered: boolean; canConfigure: boolean; onDay: (id: string, day: string) => void; pageHref: (page: number) => string }) {
  return <>
    <div className={styles.listHeading}><span>{data.totalUsers} desenvolvedores · {Number(data.total).toLocaleString("pt-BR")} contribuições</span>{canConfigure && <Link href={INTEGRATION} className="text-fg-secondary hover:underline">Gerenciar desenvolvedores</Link>}</div>
    <div className={styles.developerList}>
      {!data.users.length ? <Card><EmptyState icon={<GitCommitHorizontal />} title="Nenhum desenvolvedor encontrado" description={filtered ? "Ajuste a busca ou o período para ver outros desenvolvedores." : undefined} /></Card>
        : data.users.map(user => <DeveloperCard key={user.id} user={user} from={data.from} to={data.to} onDay={onDay} />)}
    </div>
    <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.totalUsers / data.pageSize))} buildHref={pageHref} total={data.totalUsers} rotulo="desenvolvedores" />
  </>;
}

function DeveloperCard({ user, from, to, onDay }: { user: HeatmapUser; from: string; to: string; onDay: (id: string, day: string) => void }) {
  return <section className={styles.developer}>
    <div className={styles.developerHeading}><div className={styles.developerIdentity}><DeveloperAvatar login={user.login} /><div><h2><DeveloperName login={user.login} name={user.name} />{user.isBot && <span className="ml-2 text-helper font-normal text-fg-muted">Robô (bot)</span>}</h2>
      <p>{Number(user.total).toLocaleString("pt-BR")} contribuições · {user.activeDays} dias com atividade</p></div></div>
      <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{user.counts[type]}</strong></span>)}</div>
    </div>
    <ContributionCalendar label={user.login} id={user.id} from={from} to={to} days={user.days} onDay={onDay} />
  </section>;
}

// Aba Repositórios (27/10/2026): o calendário de cada repositório conectado e, ao lado,
// quanto cada desenvolvedor contribuiu nele no período.
function Repositories({ data, onDay, pageHref }: { data: DashboardView; onDay: (id: string, day: string) => void; pageHref: (page: number) => string }) {
  return <>
    <div className={styles.listHeading}><span>{data.totalRepositories} repositórios · {Number(data.total).toLocaleString("pt-BR")} contribuições</span></div>
    <div className={styles.developerList}>
      {!data.repositories.length ? <Card><EmptyState icon={<FolderGit2 />} title="Nenhum repositório encontrado" /></Card>
        : data.repositories.map(repo => <RepositoryCard key={repo.id} repo={repo} from={data.from} to={data.to} onDay={onDay} />)}
    </div>
    <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.totalRepositories / data.pageSize))} buildHref={pageHref} total={data.totalRepositories} rotulo="repositórios" />
  </>;
}

function RepositoryCard({ repo, from, to, onDay }: { repo: RepositoryHeatmap; from: string; to: string; onDay: (id: string, day: string) => void }) {
  const top = repo.contributors[0]?.total ?? 0;
  return <section className={styles.developer}>
    <div className={styles.developerHeading}><div className={styles.developerIdentity}><span aria-hidden className={styles.avatar}><FolderGit2 size={16} /></span><div>
      <h2>{repo.fullName}{repo.private && <Lock size={13} aria-label="Privado" className="ml-2 inline align-baseline text-fg-muted" />}</h2>
      <p>{Number(repo.total).toLocaleString("pt-BR")} contribuições · {repo.activeDays} dias com atividade · {repo.contributors.length} {repo.contributors.length === 1 ? "desenvolvedor" : "desenvolvedores"}</p></div></div>
      <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{repo.counts[type]}</strong></span>)}</div>
    </div>
    <div className={styles.repositoryBody}>
      <ContributionCalendar label={repo.fullName} id={repo.id} from={from} to={to} days={repo.days} onDay={onDay} />
      <div className={styles.contributors} aria-label={`Contribuições por desenvolvedor em ${repo.fullName}`}>
        <h3>Por desenvolvedor</h3>
        {!repo.contributors.length ? <p className="text-helper text-fg-muted">Nenhuma contribuição no período.</p>
          : repo.contributors.map(person => <div key={person.id} className={styles.contributor}
            title={CONTRIBUTION_TYPES.map(type => `${TYPE_LABELS[type]}: ${person.counts[type]}`).join(" · ")}>
            <DeveloperAvatar login={person.login} />
            <span className={styles.contributorName}><DeveloperName login={person.login} name={person.name} /></span>
            <strong className="tabular-nums">{Number(person.total).toLocaleString("pt-BR")}</strong>
            <span aria-hidden className={styles.contributorBar}><span style={{ width: `${top ? Math.max(4, person.total / top * 100) : 0}%` }} /></span>
          </div>)}
      </div>
    </div>
  </section>;
}

// Commits sem conta GitHub associada (28/10/2026): o nome é o do autor no git, sem link
// nem foto, porque não há perfil para abrir. Os coletados antes disso aparecem como
// "Autoria não identificada" até a próxima atualização completa em Integrações.
function Unidentified({ data }: { data: DashboardView }) {
  return <section className="mt-6" aria-labelledby="github-sem-conta">
    <h2 id="github-sem-conta" className="text-ui font-medium text-fg">Sem conta GitHub identificada</h2>
    <p className="mt-1 text-helper text-fg-muted">{Number(data.unidentified).toLocaleString("pt-BR")} contribuições cujo autor não está associado a uma conta GitHub, fora dos totais individuais.</p>
    <Card className="mt-3 divide-y divide-border p-0">
      {data.unidentifiedAuthors.map(author => <div key={author.id} className="flex min-w-0 items-baseline gap-3 px-4 py-2 text-ui">
        <span className="min-w-0 flex-1 truncate font-medium text-fg" title={author.login}>{author.login}</span>
        <span className="min-w-0 flex-1 truncate text-fg-muted" title={author.repository}>{author.repository}</span>
        <strong className="tabular-nums">{Number(author.total).toLocaleString("pt-BR")}</strong>
      </div>)}
    </Card>
  </section>;
}

// Busca e período se aplicam sozinhos, sem "Aplicar filtros" (26/10/2026): a busca
// espera 300 ms de pausa na digitação, como as outras buscas do Connect.
// "Mostrar todos" inclui quem não vinculou a conta; clicar de novo volta aos integrados (27/10/2026).
function Toolbar({ path, query, from, to, filtered }: { path: string; query: string; from: string; to: string; filtered: boolean }) {
  const router = useRouter(), [user, setUser] = useState(() => new URLSearchParams(query).get("user") ?? ""), sent = useRef(user.trim());
  const [period, setPeriod] = useState({ from, to }), [resolved, setResolved] = useState({ from, to });
  const all = new URLSearchParams(query).get("all") === "1";
  // O período devolvido pelo servidor (o padrão de 12 meses, depois de Limpar) volta aos campos.
  if (resolved.from !== from || resolved.to !== to) { setResolved({ from, to }); setPeriod({ from, to }); }
  const apply = useCallback((next: { user: string; from?: string; to?: string; all?: boolean }) => {
    const current = new URLSearchParams(query), params = new URLSearchParams();
    sent.current = next.user;
    if (next.user) params.set("user", next.user);
    for (const key of ["from", "to"] as const) { const value = next[key] ?? current.get(key); if (value) params.set(key, value); }
    if (next.all ?? current.get("all") === "1") params.set("all", "1");
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
    <label className="min-w-0 flex-1 basis-48"><span className="sr-only">Buscar desenvolvedor</span><CampoDeBusca aria-label="Buscar desenvolvedor" placeholder="Buscar desenvolvedor…" value={user} enviarAoLimpar={false}
      onChange={event => setUser(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && user.trim() !== sent.current) apply({ user: user.trim() }); }} /></label>
    <Button variant={all ? "primary" : "secondary"} aria-pressed={all} title={all ? "Mostrando também quem não vinculou a conta GitHub. Clique para ver só os integrados." : "Incluir quem não vinculou a conta GitHub em Sua conta"}
      onClick={() => apply({ user: user.trim(), all: !all })}><Users size={14} /> Mostrar todos</Button>
    {(filtered || user.trim()) && <Button variant="ghost" size="sm" onClick={() => { setUser(""); setPeriod(resolved); sent.current = ""; router.replace(path, { scroll: false }); }}>Limpar</Button>}
  </div>;
}

function DayDetails({ detail, title, query, timezone, onClose }: { detail: Detail; title: string; query: string; timezone: string; onClose: () => void }) {
  const [page, setPage] = useState(1), [result, setResult] = useState<{ events: DayEvent[]; total: number; pageSize: number } | null>(null), [error, setError] = useState<string | null>(null);
  // O detalhe do dia só é consultado ao abrir, nunca junto com os calendários.
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams(query);
    params.set(detail.kind === "user" ? "userId" : "repository", detail.id); params.set("day", detail.day); params.set("page", String(page));
    void githubFetch<{ events: DayEvent[]; total: number; pageSize: number }>(`/api/github/events?${params}`, undefined, controller.signal).then(next => { setResult(next); setError(null); }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [detail, query, page]);
  return <Modal open onClose={onClose} title={`${title} · ${dateLabel(detail.day)}`} maxWidth="max-w-3xl">
    <div className="space-y-3 pt-3">{error && <Aviso>{error}</Aviso>}
      {!result && !error && <p className="text-ui text-fg-muted" role="status">Carregando atividades…</p>}
      {result && <><p className="text-helper text-fg-muted">{result.total} atividades</p>{result.events.map(event => <a key={event.id} href={event.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-border p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-ui font-medium text-fg"><code className={styles.eventCode}>{event.reference}</code><span className="min-w-0 break-words">{event.title ?? TYPE_SINGULAR[event.type]}</span></p>
        <p className="mt-1 break-all text-helper text-fg-muted">{TYPE_SINGULAR[event.type]} · {event.repository}{detail.kind === "repository" && <> · <DeveloperName login={event.login} name={event.name} /></>} · {formatInstantDateTime(new Date(event.occurredAt), { timeZone: timezone })} · Abrir no GitHub ↗</p>
      </a>)}
        {!result.events.length && <EmptyState icon={<GitCommitHorizontal />} title="Nenhuma contribuição neste dia" />}
        {result.total > result.pageSize && <div className="flex items-center justify-between gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-ui text-fg-muted tabular-nums">Página {page} de {Math.ceil(result.total / result.pageSize)}</span><Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
      </>}
    </div>
  </Modal>;
}
