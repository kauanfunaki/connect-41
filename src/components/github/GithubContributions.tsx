"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GitCommitHorizontal, LayoutGrid, RefreshCw, Settings2, Users } from "lucide-react";
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
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Accordion } from "@/components/ui/Accordion";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { formatInstantDateTime } from "@/lib/format";
import { githubFetch } from "@/lib/github/browser";
import { TYPE_LABELS, CONTRIBUTION_TYPES, type DashboardView, type DashboardUnchanged, type DayEvent, type HeatmapUser } from "@/lib/github/types";
import { dateLabel } from "@/lib/github/calendar";
import { ContributionCalendar } from "./ContributionCalendar";
import { SyncStatus } from "./SyncStatus";
import { DeveloperAvatar, GithubOverview } from "./GithubOverview";
import styles from "./GithubContributions.module.css";

export function GithubContributions({ initialQuery: suppliedQuery, canManage, canConfigure, view = "general" }: { initialQuery: string; canManage: boolean; canConfigure: boolean; view?: "general" | "developers" }) {
  const requestParams = new URLSearchParams(suppliedQuery); requestParams.set("view", view);
  const initialQuery = requestParams.toString(), path = view === "general" ? "/github" : "/github/desenvolvedores";
  const router = useRouter(), [data, setData] = useState<DashboardView | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [tentativa, setTentativa] = useState(0);
  const [detail, setDetail] = useState<{ userId: string; day: string } | null>(null);
  const openDay = useCallback((userId: string, day: string) => setDetail({ userId, day }), []);
  const latestQuery = useRef(initialQuery), revision = useRef<{ query: string; value: string | null } | null>(null), requestId = useRef(0);
  useEffect(() => { latestQuery.current = initialQuery; }, [initialQuery]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current, params = new URLSearchParams(initialQuery);
    if (revision.current?.query === initialQuery && revision.current.value) params.set("revision", revision.current.value);
    const result = await githubFetch<DashboardView | DashboardUnchanged>(`/api/github?${params}`, undefined, signal);
    if (signal?.aborted || latestQuery.current !== initialQuery || requestId.current !== id) return;
    revision.current = { query: initialQuery, value: result.revision };
    setData(previous => {
      if (!("unchanged" in result)) return result;
      if (!previous || previous.revision !== result.revision) return previous;
      if (JSON.stringify(previous.progress) === JSON.stringify(result.progress)) return previous;
      return { ...previous, progress: result.progress, pending: result.pending, failed: result.failed };
    });
    setError(null);
  }, [initialQuery]);
  useEffect(() => {
    const controller = new AbortController(); const timer = window.setTimeout(() => {
      setLoading(true); setDetail(null); setData(null); revision.current = null;
      void refresh(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh, tentativa]);
  useEffect(() => {
    if (!data?.connected) return;
    let disposed = false; const controller = new AbortController();
    let reading = false;
    const read = async () => {
      if (disposed || document.visibilityState !== "visible" || reading) return;
      reading = true;
      try {
        await refresh(controller.signal);
      } catch (err) { if (!disposed) setError(err instanceof Error ? err.message : "Atualização indisponível."); }
      finally { reading = false; }
    };
    const timer = window.setInterval(() => void read(), 30000);
    document.addEventListener("visibilitychange", read);
    return () => { disposed = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [data?.connected, refresh]);
  async function synchronize() {
    setBusy(true); setError(null);
    try {
      await githubFetch("/api/github/sync", { action: "queue" }); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível sincronizar."); }
    finally { setBusy(false); }
  }
  function navigate(params: URLSearchParams) { params.delete("view"); router.replace(`${path}?${params}`, { scroll: false }); }
  function pageHref(page: number) { const params = new URLSearchParams(initialQuery); params.delete("view"); params.set("page", String(page)); return `${path}?${params}`; }
  const params = new URLSearchParams(initialQuery), organizations = [...new Set(data?.repositories.map(repo => repo.owner) ?? [])].sort();
  const detailUser = data?.users.find(user => user.id === detail?.userId);
  const tabParams = new URLSearchParams(suppliedQuery); tabParams.delete("page"); tabParams.delete("view");
  const filtered = ["repository", "organization", "type", "bots"].some(key => params.has(key) && params.get(key) !== "0");
  const actions = (canManage && data?.connected) || canConfigure ? <div className="flex gap-1.5">
    {canManage && data?.connected && <IconButton title="Atualizar dados" variant="framed" onClick={() => void synchronize()} disabled={busy || !data.enabled}><RefreshCw size={16} className={busy ? "animate-spin" : ""} /></IconButton>}
    {canConfigure && <IconButton href="/admin/integracoes?integracao=github" title="Integração GitHub" variant="framed"><Settings2 size={16} /></IconButton>}
  </div> : undefined;
  // O título é o nome do módulo no menu; Geral e Desenvolvedores são abas dele (26/10/2026).
  return <PageContainer>
    <PageHeader title="GitHub — Contribuições" subtitle={view === "general" ? "Acompanhe a atividade do time no GitHub." : "Desenvolvedores e suas contribuições."} action={actions} />
    <AbasDeLink className="mb-6" ativa={view} abas={[
      { chave: "general", rotulo: "Geral", href: `/github?${tabParams}`, icone: <LayoutGrid /> },
      { chave: "developers", rotulo: "Desenvolvedores", href: `/github/desenvolvedores?${tabParams}`, icone: <Users /> },
    ]} />
    {error && <Aviso className="mb-4">{error}{!data && !loading && <> <Button variant="link" onClick={() => { setError(null); setTentativa(n => n + 1); }}>Tentar novamente</Button></>}</Aviso>}
    {loading && <div aria-busy><span className="sr-only" role="status">Carregando contribuições…</span>{view === "general" ? <><SkeletonMetrics /><SkeletonBlocks blocos={2} /></> : <SkeletonCardList cards={3} />}</div>}
    {data && !loading && <>
      <form key={initialQuery} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget), next = new URLSearchParams();
        for (const [key, value] of form) if (typeof value === "string" && value.trim()) next.set(key, value.trim());
        navigate(next);
      }}>
        <div className={styles.toolbar}>
          <label className={styles.dateField}><span>De</span><CampoData name="from" aria-label="De" defaultValue={data.from} required /></label>
          <label className={styles.dateField}><span>Até</span><CampoData name="to" aria-label="Até" defaultValue={data.to} required /></label>
          <label className="min-w-0 flex-1 basis-48"><span className="sr-only">Buscar desenvolvedor</span><Input name="user" aria-label="Buscar desenvolvedor" defaultValue={params.get("user") ?? ""} placeholder="Buscar desenvolvedor…" /></label>
          <Button type="submit" variant="secondary" size="sm">Aplicar filtros</Button>
          {(filtered || params.has("user") || params.has("from") || params.has("to")) && <Button href={path} variant="ghost" size="sm">Limpar</Button>}
        </div>
        <Accordion key={initialQuery} className={styles.filters} abertoInicial={filtered} classeDoCabecalho={styles.filterToggle} titulo={`Filtros${filtered ? " ativos" : ""}`}><div className={styles.filterFields}>
          <label><span>Repositório</span><Select name="repository" aria-label="Repositório" defaultValue={params.get("repository") ?? ""}><option value="">Todos os monitorados</option>{data.repositories.map(repo => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}</Select></label>
          <label><span>Organização / dono</span><Select name="organization" aria-label="Organização / dono" defaultValue={params.get("organization") ?? ""}><option value="">Todas</option>{organizations.map(org => <option key={org} value={org}>{org}</option>)}</Select></label>
          <label><span>Tipo de contribuição</span><Select name="type" aria-label="Tipo de contribuição" defaultValue={params.get("type") ?? ""}><option value="">Todos os tipos</option>{CONTRIBUTION_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</Select></label>
          <label className="!flex items-center gap-2"><Checkbox name="bots" value="1" defaultChecked={params.get("bots") === "1"} /> Incluir robôs (bots)</label>
        </div></Accordion>
      </form>
      <div className={styles.status}><span className={styles.statusDot} data-complete={data.complete} />{data.complete ? "Cobertura confirmada" : "Cobertura parcial"}
        {data.coveredThrough && <span>· Coletado até {formatInstantDateTime(new Date(data.coveredThrough), { timeZone: data.timezone })}</span>}
      </div>
      {data.message && <Aviso tom="atencao" className="mb-4">{data.message}</Aviso>}
      {data.progress && <Accordion className={styles.syncDetails} classeDoCabecalho={styles.syncToggle} titulo={`Sincronização${!data.enabled ? " pausada" : data.pending ? ` · ${data.pending} tarefas pendentes` : data.failed ? ` · ${data.failed} com falha` : " · fila concluída"}`}><SyncStatus progress={data.progress} timezone={data.timezone} /></Accordion>}
      {data.connected && !data.complete && <p className="mb-4 text-helper text-fg-muted">Coleta parcial: dias vazios ainda não representam zero confirmado.{data.unavailable > 0 && ` ${data.unavailable} repositórios sem acesso confirmado, fora dos totais.`}</p>}
      {view === "general" ? <GithubOverview data={data} query={suppliedQuery} /> : <>
        <div className={styles.listHeading}><span>{data.totalUsers} desenvolvedores · {Number(data.total).toLocaleString("pt-BR")} contribuições</span>{canConfigure && <Link href="/admin/integracoes?integracao=github" className="text-fg-secondary hover:underline">Gerenciar desenvolvedores</Link>}</div>
        <div className={styles.developerList}>
          {!data.users.length ? <Card><EmptyState icon={<GitCommitHorizontal />} title="Nenhum desenvolvedor encontrado" description={filtered || params.has("user") ? "Ajuste a busca ou os filtros para ver outros desenvolvedores." : undefined} /></Card>
            : data.users.map(user => <section key={user.id} className={styles.developer}>
              <div className={styles.developerHeading}><div className={styles.developerIdentity}><DeveloperAvatar login={user.login} /><div><h2>{user.login}{user.isBot && <span className="ml-2 text-helper font-normal text-fg-muted">Robô (bot)</span>}</h2>
                <p>{Number(user.total).toLocaleString("pt-BR")} contribuições · {user.activeDays} dias com atividade</p></div></div>
                <div className={styles.developerCounts}>{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]} <strong>{user.counts[type]}</strong></span>)}</div>
              </div>
              <ContributionCalendar label={user.login} userId={user.id} from={data.from} to={data.to} days={user.days} complete={data.complete} onDay={openDay} />
            </section>)}
        </div>
        <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.totalUsers / data.pageSize))} buildHref={pageHref} total={data.totalUsers} rotulo="desenvolvedores" />
      </>}
      {data.unidentified > 0 && <p className="mt-4 text-helper text-fg-muted">{data.unidentified} contribuições com autoria não identificada, fora dos totais individuais.</p>}
    </>}
    {detail && detailUser && data && !loading && <DayDetails key={`${detail.userId}:${detail.day}`} user={detailUser} day={detail.day} query={initialQuery} complete={data.complete} timezone={data.timezone} onClose={() => setDetail(null)} />}
  </PageContainer>;
}

function DayDetails({ user, day, query, complete, timezone, onClose }: { user: HeatmapUser; day: string; query: string; complete: boolean; timezone: string; onClose: () => void }) {
  const [page, setPage] = useState(1), [result, setResult] = useState<{ events: DayEvent[]; total: number; pageSize: number } | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams(query); params.set("userId", user.id); params.set("day", day); params.set("page", String(page));
    void githubFetch<{ events: DayEvent[]; total: number; pageSize: number }>(`/api/github/events?${params}`, undefined, controller.signal).then(next => { setResult(next); setError(null); }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [user.id, day, query, page]);
  return <Modal open onClose={onClose} title={`${user.login} · ${dateLabel(day)}`} maxWidth="max-w-3xl">
    <div className="space-y-3 pt-3">{!complete && <Aviso tom="info">A coleta deste período ainda está incompleta.</Aviso>}{error && <Aviso>{error}</Aviso>}
      {!result && !error && <p className="text-ui text-fg-muted" role="status">Carregando atividades…</p>}
      {result && <><p className="text-helper text-fg-muted">{result.total} atividades</p>{result.events.map(event => <a key={event.id} href={event.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-border p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand"><p className="break-all text-ui font-medium text-fg">{TYPE_LABELS[event.type]}{event.number ? ` #${event.number}` : ""} · {event.repository}</p><p className="mt-1 text-helper text-fg-muted">{formatInstantDateTime(new Date(event.occurredAt), { timeZone: timezone })} · Abrir no GitHub ↗</p></a>)}
        {!result.events.length && <EmptyState icon={<GitCommitHorizontal />} title={complete ? "Nenhuma contribuição neste dia" : "Nenhuma contribuição coletada para este dia"} />}
        {result.total > result.pageSize && <div className="flex items-center justify-between gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-ui text-fg-muted tabular-nums">Página {page} de {Math.ceil(result.total / result.pageSize)}</span><Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
      </>}
    </div>
  </Modal>;
}
