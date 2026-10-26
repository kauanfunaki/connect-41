"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GitCommitHorizontal, LayoutGrid, Settings2, Users } from "lucide-react";
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
import { TYPE_LABELS, CONTRIBUTION_TYPES, type DashboardView, type DayEvent, type HeatmapUser } from "@/lib/github/types";
import { dateLabel } from "@/lib/github/calendar";
import { ContributionCalendar } from "./ContributionCalendar";
import { DeveloperAvatar, GithubOverview } from "./GithubOverview";
import styles from "./GithubContributions.module.css";

const INTEGRATION = "/admin/integracoes?integracao=github";
export function GithubContributions({ initialQuery: suppliedQuery, canConfigure, view = "general" }: { initialQuery: string; canConfigure: boolean; view?: "general" | "developers" }) {
  const requestParams = new URLSearchParams(suppliedQuery); requestParams.set("view", view);
  const initialQuery = requestParams.toString(), path = view === "general" ? "/github" : "/github/desenvolvedores";
  const [data, setData] = useState<DashboardView | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [tentativa, setTentativa] = useState(0), [dates, setDates] = useState<{ from: string; to: string } | null>(null);
  const [detail, setDetail] = useState<{ userId: string; day: string } | null>(null);
  const openDay = useCallback((userId: string, day: string) => setDetail({ userId, day }), [setDetail]);
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
  const params = new URLSearchParams(initialQuery), detailUser = data?.users.find(user => user.id === detail?.userId);
  const tabParams = new URLSearchParams(suppliedQuery); tabParams.delete("page"); tabParams.delete("view");
  // Repositório, organização, tipo e robôs saíram da tela com a caixa de filtros (26/10/2026);
  // um link antigo com eles ainda filtra, e o Limpar aparece para desfazer.
  const filtered = ["user", "from", "to", "repository", "organization", "type"].some(key => params.has(key)) || params.get("bots") === "1";
  // O título é o nome do módulo no menu; Geral e Desenvolvedores são abas dele (26/10/2026).
  return <PageContainer>
    <PageHeader title="GitHub — Contribuições" subtitle={view === "general" ? "Acompanhe a atividade do time no GitHub." : "Desenvolvedores e suas contribuições."}
      action={canConfigure ? <IconButton href={INTEGRATION} title="Integração GitHub" variant="framed"><Settings2 size={16} /></IconButton> : undefined} />
    <AbasDeLink className="mb-6" ativa={view} abas={[
      { chave: "general", rotulo: "Geral", href: `/github?${tabParams}`, icone: <LayoutGrid /> },
      { chave: "developers", rotulo: "Desenvolvedores", href: `/github/desenvolvedores?${tabParams}`, icone: <Users /> },
    ]} />
    {dates && !data?.message && <Toolbar path={path} query={suppliedQuery} from={dates.from} to={dates.to} filtered={filtered} />}
    {error && <Aviso className="mb-4">{error}{!data && !loading && <> <Button variant="link" onClick={() => { setError(null); setTentativa(n => n + 1); }}>Tentar novamente</Button></>}</Aviso>}
    {loading && <div aria-busy><span className="sr-only" role="status">Carregando contribuições…</span>{view === "general" ? <><SkeletonMetrics /><SkeletonBlocks blocos={2} /></> : <SkeletonCardList cards={3} />}</div>}
    {data?.message && !loading && <Aviso tom="atencao" className="mb-4">{data.message}{canConfigure && <> <Link href={INTEGRATION} className="font-medium underline">Abrir Integrações</Link></>}</Aviso>}
    {data && !data.message && !loading && <>
      {view === "general" ? <GithubOverview data={data} query={suppliedQuery} /> : <>
        <div className={styles.listHeading}><span>{data.totalUsers} desenvolvedores · {Number(data.total).toLocaleString("pt-BR")} contribuições</span>{canConfigure && <Link href={INTEGRATION} className="text-fg-secondary hover:underline">Gerenciar desenvolvedores</Link>}</div>
        <div className={styles.developerList}>
          {!data.users.length ? <Card><EmptyState icon={<GitCommitHorizontal />} title="Nenhum desenvolvedor encontrado" description={filtered ? "Ajuste a busca ou o período para ver outros desenvolvedores." : undefined} /></Card>
            : data.users.map(user => <section key={user.id} className={styles.developer}>
              <div className={styles.developerHeading}><div className={styles.developerIdentity}><DeveloperAvatar login={user.login} /><div><h2>{user.login}{user.isBot && <span className="ml-2 text-helper font-normal text-fg-muted">Robô (bot)</span>}</h2>
                <p>{Number(user.total).toLocaleString("pt-BR")} contribuições · {user.activeDays} dias com atividade</p></div></div>
                <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{user.counts[type]}</strong></span>)}</div>
              </div>
              <ContributionCalendar label={user.login} userId={user.id} from={data.from} to={data.to} days={user.days} onDay={openDay} />
            </section>)}
        </div>
        <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.totalUsers / data.pageSize))} buildHref={pageHref} total={data.totalUsers} rotulo="desenvolvedores" />
      </>}
      {data.unidentified > 0 && <p className="mt-4 text-helper text-fg-muted">{data.unidentified} contribuições com autoria não identificada, fora dos totais individuais.</p>}
    </>}
    {detail && detailUser && data && !loading && <DayDetails key={`${detail.userId}:${detail.day}`} user={detailUser} day={detail.day} query={initialQuery} timezone={data.timezone} onClose={() => setDetail(null)} />}
  </PageContainer>;
}

// Busca e período se aplicam sozinhos, sem "Aplicar filtros" (26/10/2026): a busca
// espera 300 ms de pausa na digitação, como as outras buscas do Connect.
function Toolbar({ path, query, from, to, filtered }: { path: string; query: string; from: string; to: string; filtered: boolean }) {
  const router = useRouter(), [user, setUser] = useState(() => new URLSearchParams(query).get("user") ?? ""), sent = useRef(user.trim());
  const [period, setPeriod] = useState({ from, to }), [resolved, setResolved] = useState({ from, to });
  // O período devolvido pelo servidor (o padrão de 12 meses, depois de Limpar) volta aos campos.
  if (resolved.from !== from || resolved.to !== to) { setResolved({ from, to }); setPeriod({ from, to }); }
  const apply = useCallback((next: { user: string; from?: string; to?: string }) => {
    const current = new URLSearchParams(query), params = new URLSearchParams();
    sent.current = next.user;
    if (next.user) params.set("user", next.user);
    for (const key of ["from", "to"] as const) { const value = next[key] ?? current.get(key); if (value) params.set(key, value); }
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
    {(filtered || user.trim()) && <Button variant="ghost" size="sm" onClick={() => { setUser(""); setPeriod(resolved); sent.current = ""; router.replace(path, { scroll: false }); }}>Limpar</Button>}
  </div>;
}

function DayDetails({ user, day, query, timezone, onClose }: { user: HeatmapUser; day: string; query: string; timezone: string; onClose: () => void }) {
  const [page, setPage] = useState(1), [result, setResult] = useState<{ events: DayEvent[]; total: number; pageSize: number } | null>(null), [error, setError] = useState<string | null>(null);
  // O detalhe do dia só é consultado ao abrir, nunca junto com os calendários.
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams(query); params.set("userId", user.id); params.set("day", day); params.set("page", String(page));
    void githubFetch<{ events: DayEvent[]; total: number; pageSize: number }>(`/api/github/events?${params}`, undefined, controller.signal).then(next => { setResult(next); setError(null); }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [user.id, day, query, page]);
  return <Modal open onClose={onClose} title={`${user.login} · ${dateLabel(day)}`} maxWidth="max-w-3xl">
    <div className="space-y-3 pt-3">{error && <Aviso>{error}</Aviso>}
      {!result && !error && <p className="text-ui text-fg-muted" role="status">Carregando atividades…</p>}
      {result && <><p className="text-helper text-fg-muted">{result.total} atividades</p>{result.events.map(event => <a key={event.id} href={event.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-border p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand"><p className="break-all text-ui font-medium text-fg">{TYPE_LABELS[event.type]}{event.number ? ` #${event.number}` : ""} · {event.repository}</p><p className="mt-1 text-helper text-fg-muted">{formatInstantDateTime(new Date(event.occurredAt), { timeZone: timezone })} · Abrir no GitHub ↗</p></a>)}
        {!result.events.length && <EmptyState icon={<GitCommitHorizontal />} title="Nenhuma contribuição neste dia" />}
        {result.total > result.pageSize && <div className="flex items-center justify-between gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-ui text-fg-muted tabular-nums">Página {page} de {Math.ceil(result.total / result.pageSize)}</span><Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
      </>}
    </div>
  </Modal>;
}
