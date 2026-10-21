"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/useConfirm";
import { githubFetch } from "@/lib/github/browser";
import type { IntegrationView } from "@/lib/github/types";

export function GithubIntegration() {
  const { requestConfirm, dialog } = useConfirm();
  const [data, setData] = useState<IntegrationView | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<string[]>([]), [search, setSearch] = useState(""), [interval, setIntervalMinutes] = useState(30), [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [login, setLogin] = useState(""), [pump, setPump] = useState(false);
  const dirty = useRef(false), processing = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await githubFetch<IntegrationView>("/api/github/integration", undefined, signal); setData(next);
    if (!dirty.current) { setSelection(next.repositories.filter(repo => repo.selected).map(repo => repo.id)); setTimezone(next.timezone); setIntervalMinutes(next.intervalMinutes); }
    return next;
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { void refresh(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); }); }, 0); return () => { controller.abort(); window.clearTimeout(timer); }; }, [refresh]);
  useEffect(() => {
    if (!pump || !data?.pending) return;
    let disposed = false; const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (document.visibilityState !== "visible" || processing.current) { if (!disposed) void refresh(controller.signal).catch(() => {}); return; }
      processing.current = true;
      try { await githubFetch("/api/github/sync", { action: "process" }, controller.signal); if (!disposed) await refresh(controller.signal); }
      catch (err) { if (!disposed) { setError(err instanceof Error ? err.message : "Não foi possível atualizar."); setPump(false); } }
      finally { processing.current = false; }
    }, 5000);
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [data, pump, refresh]);
  async function act(action: string, extras: Record<string, unknown> = {}) {
    if (!data) return; setBusy(true); setError(null); setPump(false);
    try {
      await githubFetch("/api/github/integration", { action, generation: data.generation, ...extras });
      dirty.current = false; const next = await refresh(); setPump(next.pending > 0);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  if (!data) return <div className="space-y-3">{error ? <Aviso>{error}</Aviso> : <p className="text-fs-3 text-fg-muted">Carregando conexão…</p>}<Button variant="secondary" onClick={() => void refresh().catch(err => setError(err.message))}>Atualizar</Button></div>;
  const visible = data.repositories.filter(repo => repo.fullName.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5 text-fs-3">
    <p className="text-fg-secondary">Conexão compartilhada do escritório, exclusiva do Tech. Pessoas com acesso ao módulo poderão consultar a atividade dos repositórios selecionados.</p>
    {error && <Aviso>{error}</Aviso>}{data.error && <Aviso tom="atencao">{data.error}</Aviso>}
    {!data.configured && <Aviso tom="atencao">A conexão GitHub ainda não foi configurada no servidor. Fale com o suporte.</Aviso>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
      <div><p className="font-medium text-fg">{data.login ? `Conta: ${data.login}` : "Nenhuma conta conectada"}</p><p className="mt-1 text-fs-2 text-fg-muted">{data.connected ? data.enabled ? "Sincronização habilitada" : "Sincronização pausada" : data.status === "needs_reconnect" ? "Reconexão necessária" : "Desconectada"}</p></div>
      <div className="flex flex-wrap gap-2">{data.configured && <Button href="/api/integrations/github/connect" nativo>{data.connected ? "Reconectar / trocar conta" : "Conectar GitHub"}</Button>}
        {data.connected && <Button variant="danger" disabled={busy} onClick={() => requestConfirm({ title: "Desconectar GitHub?", description: "A coleta e a visualização serão interrompidas. O histórico será preservado.", confirmLabel: "Desconectar", destructive: true }, () => act("disconnect"))}>Desconectar</Button>}</div>
    </div>
    <p className="text-fs-2 text-fg-muted">Para consultar repositórios privados, a autorização do GitHub também concede escrita. O módulo faz apenas consultas. Organizações podem exigir aprovação ou SSO. <a className="text-brand underline" href="https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps" target="_blank" rel="noreferrer">Ver permissões <ExternalLink className="inline size-3" /></a></p>
    {data.connected && <>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-fg">Repositórios ({selection.length} selecionados)</h3>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act("discover")}><RefreshCw size={14} /> Atualizar lista</Button></div>
      <Input aria-label="Buscar repositório" placeholder="Buscar repositório…" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {!visible.length && <p className="p-4 text-fg-muted">{data.pending && !data.inventoryAt ? "Buscando repositórios…" : "Nenhum repositório encontrado."}</p>}
        {visible.map(repo => <label key={repo.id} className="flex items-start gap-3 p-3 hover:bg-surface-hover"><Checkbox className="mt-1" checked={selection.includes(repo.id)} disabled={busy || !repo.accessible && !repo.selected}
          onChange={event => { dirty.current = true; setSelection(old => event.target.checked ? [...old, repo.id] : old.filter(id => id !== repo.id)); }} />
          <span className="min-w-0"><span className="break-all font-medium text-fg">{repo.fullName}</span><span className="mt-1 block text-fs-2 text-fg-muted">{[repo.private ? "Privado" : "Público", repo.fork ? "Fork" : null, repo.archived ? "Arquivado" : null, !repo.accessible ? "Acesso indisponível" : null].filter(Boolean).join(" · ")}</span>{repo.error && <span className="text-fs-2 text-warning-fg">{repo.error}</span>}</span>
        </label>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-fg-secondary"><span>Atualizar a cada (minutos)</span><Input type="number" min={10} max={1440} value={interval} onChange={event => { dirty.current = true; setIntervalMinutes(Number(event.target.value)); }} /></label>
        <label className="space-y-1 text-fg-secondary"><span>Fuso dos dias</span><Input value={timezone} onChange={event => { dirty.current = true; setTimezone(event.target.value); }} /><span className="block text-fs-1 text-fg-muted">Fica fixo após a primeira coleta.</span></label></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void act("settings", { repositories: selection, timezone, intervalMinutes: interval })}>Salvar e sincronizar</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void act(data.enabled ? "pause" : "resume")}>{data.enabled ? "Pausar" : "Retomar"}</Button>
        <Button href="/github" variant="secondary">Abrir contribuições</Button></div>
      <p className="text-fs-2 text-fg-muted" aria-live="polite">{data.pending} tarefas pendentes · {data.failed} com falha{data.pending > 0 && (pump ? " · processando lotes enquanto esta tela estiver aberta" : " · aguardando processamento")}</p>
      {data.pending > 0 && !pump && <Button size="sm" variant="secondary" onClick={() => setPump(true)}>Processar pendências</Button>}
      <form className="space-y-2 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); void act("track", { login }).then(() => setLogin("")); }}><label className="block text-fg-secondary" htmlFor="github-track-login">Acompanhar usuário mesmo sem atividade</label>
        <div className="flex flex-wrap gap-2"><Input id="github-track-login" required value={login} onChange={event => setLogin(event.target.value)} placeholder="Login no GitHub" className="min-w-0 flex-1" /><Button type="submit" variant="secondary" disabled={busy}>Acompanhar</Button></div></form>
    </>}
    {dialog}
  </div>;
}
