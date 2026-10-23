"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCommitHorizontal, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { formatInstantDateTime } from "@/lib/format";
import { githubFetch } from "@/lib/github/browser";
import { TYPE_LABELS, CONTRIBUTION_TYPES, type DashboardView, type DashboardUnchanged, type DayEvent, type HeatmapUser } from "@/lib/github/types";
import { dateLabel } from "@/lib/github/calendar";
import { ContributionCalendar } from "./ContributionCalendar";
import { SyncStatus } from "./SyncStatus";

export function GithubContributions({ initialQuery, canManage, canConfigure }: { initialQuery: string; canManage: boolean; canConfigure: boolean }) {
  const router = useRouter(), [data, setData] = useState<DashboardView | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
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
      setLoading(true); setDetail(null);
      void refresh(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh]);
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
  function changePage(page: number) { const params = new URLSearchParams(initialQuery); params.set("page", String(page)); router.replace(`/github?${params}`, { scroll: false }); }
  const params = new URLSearchParams(initialQuery), organizations = [...new Set(data?.repositories.map(repo => repo.owner) ?? [])].sort();
  const detailUser = data?.users.find(user => user.id === detail?.userId);
  return <PageContainer>
    <PageHeader title="GitHub — Contribuições" subtitle="Atividade da equipe nos repositórios monitorados pelo Tech" action={<div className="flex flex-wrap gap-2">
      {canConfigure && <Button href="/admin/integracoes?integracao=github" variant="secondary"><Settings2 size={15} /> Integração GitHub</Button>}
      {canManage && data?.connected && <Button onClick={() => void synchronize()} disabled={busy || !data.enabled}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Atualizar dados</Button>}
    </div>} />
    {error && <Aviso className="mb-4">{error}</Aviso>}
    {loading && !data && <Card className="p-8 text-fs-3 text-fg-muted" aria-live="polite">Carregando contribuições…</Card>}
    {data && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-fs-2 text-fg-muted"><span>{data.login ? `Conta conectada: ${data.login}` : "Conta não conectada"}</span><span>{data.timezone}</span>
        {data.coveredThrough && <span>Dados coletados até {formatInstantDateTime(new Date(data.coveredThrough), { timeZone: data.timezone })}</span>}
        {data.connected && !data.enabled && <span>Sincronização pausada</span>}</div>
      {data.message && <Aviso tom="atencao">{data.message}</Aviso>}
      <SyncStatus progress={data.progress} timezone={data.timezone} />
      {data.connected && !data.complete && <Aviso tom="info">Coleta parcial: dias sem atividade registrada ainda não representam zero confirmado.{data.pending > 0 && ` ${data.pending} tarefas pendentes.`}{data.failed > 0 && ` ${data.failed} tarefas precisam de nova tentativa.`}{data.unavailable > 0 && ` ${data.unavailable} repositórios aguardam confirmação ou estão sem acesso e foram excluídos dos totais.`}</Aviso>}
      <Card className="p-4"><form key={initialQuery} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget), next = new URLSearchParams();
        for (const [key, value] of form) if (typeof value === "string" && value.trim()) next.set(key, value.trim());
        next.delete("page"); router.replace(`/github?${next}`, { scroll: false });
      }}>
        <label className="space-y-1 text-fs-2 text-fg-secondary"><span>De</span><CampoData name="from" aria-label="De" defaultValue={data.from} required /></label>
        <label className="space-y-1 text-fs-2 text-fg-secondary"><span>Até</span><CampoData name="to" aria-label="Até" defaultValue={data.to} required /></label>
        <label className="space-y-1 text-fs-2 text-fg-secondary"><span>Repositório</span><Select name="repository" aria-label="Repositório" defaultValue={params.get("repository") ?? ""}><option value="">Todos os monitorados</option>{data.repositories.map(repo => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}</Select></label>
        <label className="space-y-1 text-fs-2 text-fg-secondary"><span>Organização / dono</span><Select name="organization" aria-label="Organização / dono" defaultValue={params.get("organization") ?? ""}><option value="">Todas</option>{organizations.map(org => <option key={org} value={org}>{org}</option>)}</Select></label>
        <label className="space-y-1 text-fs-2 text-fg-secondary"><span>Usuário</span><Input name="user" defaultValue={params.get("user") ?? ""} placeholder="Buscar login" /></label>
        <label className="space-y-1 text-fs-2 text-fg-secondary"><span>Tipo de contribuição</span><Select name="type" aria-label="Tipo de contribuição" defaultValue={params.get("type") ?? ""}><option value="">Todos os tipos</option>{CONTRIBUTION_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</Select></label>
        <label className="flex items-center gap-2 self-end pb-2 text-fs-3 text-fg-secondary"><Checkbox name="bots" value="1" defaultChecked={params.get("bots") === "1"} /> Incluir bots</label>
        <div className="flex flex-wrap items-end gap-2"><Button type="submit" variant="secondary">Aplicar filtros</Button><Button href="/github" variant="ghost">Limpar</Button></div>
      </form></Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ["Contribuições", Number(data.total).toLocaleString("pt-BR")], ["Usuários", Number(data.totalUsers).toLocaleString("pt-BR")],
        ["Repositórios disponíveis", data.repositories.length], ["Cobertura", data.complete ? "Confirmada" : "Parcial"],
      ].map(([label, value]) => <Card key={label} className="p-4"><p className="text-fs-2 text-fg-muted">{label}</p><p className="mt-1 text-xl font-semibold text-fg">{value}</p></Card>)}</div>
      {data.unidentified > 0 && <p className="text-fs-2 text-fg-muted">{data.unidentified} contribuições com autoria não identificada pelo GitHub, fora da comparação individual.</p>}
      {!data.users.length ? <Card className="flex flex-col items-center gap-3 p-8 text-center"><GitCommitHorizontal className="text-fg-muted" size={30} /><p className="text-fs-3 text-fg-secondary">{data.complete ? "Nenhuma contribuição neste período e nestes filtros." : "Nenhuma contribuição coletada para os filtros atuais."}</p>{canConfigure && <Button href="/admin/integracoes?integracao=github" variant="secondary">Configurar repositórios</Button>}</Card>
        : data.users.map(user => <Card key={user.id} className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-fg">{user.login}{user.isBot && <span className="ml-2 text-fs-2 font-normal text-fg-muted">bot</span>}{user.tracked && <span className="ml-2 text-fs-2 font-normal text-fg-muted">acompanhado</span>}</p>
            <p className="mt-1 text-fs-2 text-fg-muted">{Number(user.total).toLocaleString("pt-BR")} contribuições · {user.activeDays} dias com atividade</p></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-fs-2 text-fg-secondary">{CONTRIBUTION_TYPES.map(type => <span key={type}>{TYPE_LABELS[type]}: <strong className="font-medium text-fg">{user.counts[type]}</strong></span>)}</div></div>
          <ContributionCalendar label={user.login} userId={user.id} from={data.from} to={data.to} days={user.days} complete={data.complete} onDay={openDay} />
        </Card>)}
      {data.totalUsers > data.pageSize && <div className="flex items-center justify-between gap-3 text-fs-3 text-fg-muted"><Button variant="secondary" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>Anterior</Button><span>Página {data.page} de {Math.ceil(data.totalUsers / data.pageSize)}</span><Button variant="secondary" disabled={data.page * data.pageSize >= data.totalUsers} onClick={() => changePage(data.page + 1)}>Próxima</Button></div>}
      <p className="text-fs-2 text-fg-muted">Commits do branch padrão, aberturas de PRs e issues e revisões submetidas. Os totais refletem os repositórios selecionados e podem diferir do calendário do perfil GitHub. Bots ficam ocultos por padrão.</p>
    </div>}
    {detail && detailUser && data && <DayDetails key={`${detail.userId}:${detail.day}`} user={detailUser} day={detail.day} query={initialQuery} complete={data.complete} timezone={data.timezone} onClose={() => setDetail(null)} />}
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
      {!result && !error && <p className="text-fs-3 text-fg-muted">Carregando atividades…</p>}
      {result && <><p className="text-fs-2 text-fg-muted">{result.total} atividades</p>{result.events.map(event => <a key={event.id} href={event.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-border p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand"><p className="break-all text-fs-3 font-medium text-fg">{TYPE_LABELS[event.type]}{event.number ? ` #${event.number}` : ""} · {event.repository}</p><p className="mt-1 text-fs-2 text-fg-muted">{formatInstantDateTime(new Date(event.occurredAt), { timeZone: timezone })} · Abrir no GitHub ↗</p></a>)}
        {!result.events.length && <p className="text-fs-3 text-fg-muted">{complete ? "Nenhuma contribuição neste dia." : "Nenhuma contribuição coletada para este dia."}</p>}
        {result.total > result.pageSize && <div className="flex items-center justify-between gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-fs-2">{page} / {Math.ceil(result.total / result.pageSize)}</span><Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
      </>}
    </div>
  </Modal>;
}
