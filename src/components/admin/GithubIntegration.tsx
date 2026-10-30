"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Select } from "@/components/ui/Select";

/** Os fusos do Brasil, com o nome que se lê. Um fuso já gravado fora desta lista continua na opção. */
const FUSOS: [string, string][] = [
  ["America/Sao_Paulo", "Brasília (São Paulo, Curitiba)"],
  ["America/Manaus", "Amazonas (Manaus)"],
  ["America/Cuiaba", "Mato Grosso (Cuiabá)"],
  ["America/Campo_Grande", "Mato Grosso do Sul (Campo Grande)"],
  ["America/Belem", "Pará (Belém)"],
  ["America/Fortaleza", "Nordeste (Fortaleza)"],
  ["America/Recife", "Pernambuco (Recife)"],
  ["America/Rio_Branco", "Acre (Rio Branco)"],
  ["America/Noronha", "Fernando de Noronha"],
];
import { githubFetch } from "@/lib/github/browser";
import type { IntegrationView } from "@/lib/github/types";
import { SyncStatus } from "@/components/github/SyncStatus";

export function GithubIntegration() {
  const { requestConfirm, dialog } = useConfirm();
  const [data, setData] = useState<IntegrationView | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<string[]>([]), [search, setSearch] = useState(""), [interval, setIntervalMinutes] = useState(30), [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [login, setLogin] = useState("");
  const [clientId, setClientId] = useState(""), [clientSecret, setClientSecret] = useState(""), [saved, setSaved] = useState(false);
  const [credentialsChanged, setCredentialsChanged] = useState(false);
  const credentialsDirty = useRef(false);
  const dirty = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await githubFetch<IntegrationView>("/api/github/integration", undefined, signal); setData(next);
    if (!credentialsDirty.current) setClientId(next.clientId);
    if (!dirty.current) { setSelection(next.repositories.filter(repo => repo.selected).map(repo => repo.id)); setTimezone(next.timezone); setIntervalMinutes(next.intervalMinutes); }
    return next;
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { void refresh(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); }); }, 0); return () => { controller.abort(); window.clearTimeout(timer); }; }, [refresh]);
  useEffect(() => {
    if (!data?.connected) return;
    let disposed = false; const controller = new AbortController();
    let reading = false;
    const read = async () => {
      if (disposed || document.visibilityState !== "visible" || reading) return;
      reading = true;
      try { await refresh(controller.signal); }
      catch (err) { if (!disposed) setError(err instanceof Error ? err.message : "Não foi possível atualizar."); }
      finally { reading = false; }
    };
    const timer = window.setInterval(() => void read(), 15000);
    document.addEventListener("visibilitychange", read);
    return () => { disposed = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, [data?.connected, refresh]);
  // Qual ação está correndo e o aviso de que terminou (auditoria de UX,
  // 30/10/2026): os botões só ficavam desligados, sem dizer qual estava
  // trabalhando nem quando tinha dado certo.
  const [emCurso, setEmCurso] = useState<string | null>(null);
  const toast = useToast();
  const FEITO: Record<string, string> = { settings: "Configuração salva. A sincronização começa no próximo ciclo.", pause: "Sincronização pausada.", resume: "Sincronização retomada.", discover: "Lista de repositórios atualizada.", full: "Atualização completa pedida.", track: "Usuário acompanhado.", disconnect: "GitHub desconectado." };
  async function act(action: string, extras: Record<string, unknown> = {}) {
    if (!data) return; setBusy(true); setEmCurso(action); setError(null); setSaved(false);
    try {
      await githubFetch("/api/github/integration", { action, generation: data.generation, ...extras });
      if (action === "credentials") { credentialsDirty.current = false; setCredentialsChanged(false); setClientSecret(""); setSaved(true); }
      dirty.current = false; await refresh();
      if (FEITO[action]) toast.success(FEITO[action]);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setBusy(false); setEmCurso(null); }
  }
  if (!data) return <div className="space-y-3">{error ? <Aviso>{error}</Aviso> : <p className="text-fs-3 text-fg-muted">Carregando conexão…</p>}<Button variant="secondary" onClick={() => void refresh().catch(err => setError(err.message))}>Atualizar</Button></div>;
  const visible = data.repositories.filter(repo => repo.fullName.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5 text-fs-3">
    <p className="text-fg-secondary">Conexão compartilhada do escritório, exclusiva do Tech. Pessoas com acesso ao módulo poderão consultar a atividade dos repositórios selecionados.</p>
    {error && <Aviso>{error}</Aviso>}{data.error && <Aviso tom="atencao">{data.error}</Aviso>}
    {!data.serverReady && <Aviso tom="atencao">A instalação precisa configurar o endereço público e a chave de proteção das credenciais. Fale com o suporte.</Aviso>}
    <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={event => { event.preventDefault(); void act("credentials", { clientId, clientSecret }); }}>
      <h3 className="font-medium text-fg">OAuth App da empresa</h3>
      <p className="text-fg-secondary">Cadastre um OAuth App no GitHub da empresa e informe as credenciais abaixo. Depois de salvar, clique em Conectar GitHub para autorizar a conta.</p>
      <a className="inline-flex items-center gap-1 text-brand underline" href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer">Cadastrar OAuth App <ExternalLink size={14} /></a>
      {data.callbackUrl && <label className="block space-y-1 text-fg-secondary"><span>Authorization callback URL</span><Input readOnly value={data.callbackUrl} onFocus={event => event.target.select()} /><span className="block text-fs-1 text-fg-muted">Copie este endereço para o cadastro do OAuth App no GitHub.</span></label>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-fg-secondary"><span>Client ID</span><Input required maxLength={255} autoComplete="off" value={clientId} disabled={busy || !data.serverReady} onChange={event => { credentialsDirty.current = true; setCredentialsChanged(true); setSaved(false); setClientId(event.target.value); }} /></label>
        <label className="space-y-1 text-fg-secondary"><span>Client Secret</span><Input type="password" required={!data.hasClientSecret || clientId.trim() !== data.clientId} maxLength={1024} autoComplete="new-password" value={clientSecret} disabled={busy || !data.serverReady} placeholder={data.hasClientSecret ? "Segredo salvo" : "Informe o Client Secret"} onChange={event => { credentialsDirty.current = true; setCredentialsChanged(true); setSaved(false); setClientSecret(event.target.value); }} />
          <span className="block text-fs-1 text-fg-muted">{data.hasClientSecret ? "Deixe vazio para manter o segredo do mesmo aplicativo." : "O segredo será guardado protegido e não será exibido novamente."}</span></label>
      </div>
      <p className="text-fs-2 text-fg-muted">Alterar as credenciais exige uma nova autorização da conta. O histórico coletado será preservado.</p>
      <Button type="submit" variant="secondary" disabled={busy || !data.serverReady} loading={emCurso === "credentials"} loadingLabel="Salvando…">Salvar credenciais</Button>
      {saved && <p role="status" className="text-fg-secondary">Credenciais salvas. Autorize a conta em Conectar GitHub.</p>}
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
      <div><p className="font-medium text-fg">{data.login ? `Conta: ${data.login}` : "Nenhuma conta conectada"}</p><p className="mt-1 text-fs-2 text-fg-muted">{data.connected ? data.enabled ? "Sincronização habilitada" : "Sincronização pausada" : data.status === "needs_reconnect" ? "Reconexão necessária" : "Desconectada"}</p></div>
      <div className="flex flex-wrap gap-2">{data.configured && (busy || credentialsChanged ? <Button disabled>{data.connected ? "Reconectar / trocar conta" : "Conectar GitHub"}</Button> : <Button href="/api/integrations/github/connect" nativo>{data.connected ? "Reconectar / trocar conta" : "Conectar GitHub"}</Button>)}
        {data.connected && <Button variant="danger" disabled={busy} onClick={() => requestConfirm({ title: "Desconectar GitHub?", description: "A coleta e a visualização serão interrompidas. O histórico será preservado.", confirmLabel: "Desconectar", destructive: true }, () => act("disconnect"))}>Desconectar</Button>}</div>
    </div>
    <p className="text-fs-2 text-fg-muted">Para consultar repositórios privados, a autorização do GitHub também concede escrita. O módulo faz apenas consultas. Organizações podem exigir aprovação ou SSO. <a className="text-brand underline" href="https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps" target="_blank" rel="noreferrer">Ver permissões <ExternalLink className="inline size-3" /></a></p>
    {data.connected && <>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-fg">Repositórios ({selection.length} selecionados)</h3>
        <Button size="sm" variant="secondary" disabled={busy} loading={emCurso === "discover"} loadingLabel="Atualizando…" onClick={() => void act("discover")}><RefreshCw size={14} /> Atualizar lista</Button></div>
      <Input aria-label="Buscar repositório" placeholder="Buscar repositório…" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {!visible.length && <p className="p-4 text-fg-muted">{data.pending && !data.inventoryAt ? "Buscando repositórios…" : "Nenhum repositório encontrado."}</p>}
        {visible.map(repo => <label key={repo.id} className="flex items-start gap-3 p-3 hover:bg-surface-hover"><Checkbox className="mt-1" checked={selection.includes(repo.id)} disabled={busy || !repo.accessible && !repo.selected}
          onChange={event => { dirty.current = true; setSelection(old => event.target.checked ? [...old, repo.id] : old.filter(id => id !== repo.id)); }} />
          <span className="min-w-0"><span className="break-all font-medium text-fg">{repo.fullName}</span><span className="mt-1 block text-fs-2 text-fg-muted">{[repo.private ? "Privado" : "Público", repo.fork ? "Fork" : null, repo.archived ? "Arquivado" : null, !repo.accessible ? "Acesso indisponível" : null].filter(Boolean).join(" · ")}</span>{repo.error && <span className="text-fs-2 text-warning-fg">{repo.error}</span>}</span>
        </label>)}
      </div>
      {/* Rótulos do `CampoForm`, minutos no `CampoNumero` e o fuso numa lista —
          era texto livre ("America/Sao_Paulo"), fácil de digitar errado. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoForm label="Atualizar a cada (minutos)" htmlFor="github-intervalo" helper="De 10 a 1440 minutos."><CampoNumero id="github-intervalo" min={10} max={1440} value={String(interval)} onChange={event => { dirty.current = true; setIntervalMinutes(Number(event.target.value)); }} /></CampoForm>
        <CampoForm label="Fuso dos dias" htmlFor="github-fuso" helper="Fica fixo após a primeira coleta."><Select id="github-fuso" value={timezone} onChange={event => { dirty.current = true; setTimezone(event.target.value); }}>{[...new Set([timezone, ...FUSOS.map(f => f[0])])].map(f => <option key={f} value={f}>{FUSOS.find(x => x[0] === f)?.[1] ?? f}</option>)}</Select></CampoForm>
      </div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} loading={emCurso === "settings"} loadingLabel="Salvando…" onClick={() => void act("settings", { repositories: selection, timezone, intervalMinutes: interval })}>Salvar e sincronizar</Button>
        <Button variant="secondary" disabled={busy} loading={emCurso === "pause" || emCurso === "resume"} loadingLabel={data.enabled ? "Pausando…" : "Retomando…"} onClick={() => void act(data.enabled ? "pause" : "resume")}>{data.enabled ? "Pausar" : "Retomar"}</Button>
        <Button variant="secondary" disabled={busy || !data.enabled} onClick={() => requestConfirm({ title: "Forçar atualização completa?", description: "Os repositórios selecionados serão consultados de novo nos últimos 12 meses. A coleta demora mais e consome mais do limite da API do GitHub.", confirmLabel: "Forçar atualização" }, () => act("full"))}>Forçar atualização completa</Button>
        <Button href="/github" variant="secondary">Abrir contribuições</Button></div>
      <p className="text-fs-2 text-fg-muted">A cada intervalo, a coleta busca só as alterações. Um repositório novo traz os últimos 12 meses na primeira coleta. Use Forçar atualização completa para consultar de novo o histórico de todos os selecionados.</p>
      <SyncStatus progress={data.progress} timezone={data.timezone} />
      <Button size="sm" variant="secondary" onClick={() => void refresh().catch(err => setError(err.message))}>Atualizar status</Button>
      <form className="space-y-2 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); void act("track", { login }).then(() => setLogin("")); }}><label className="block text-fg-secondary" htmlFor="github-track-login">Acompanhar usuário mesmo sem atividade</label>
        <div className="flex flex-wrap gap-2"><Input id="github-track-login" required value={login} onChange={event => setLogin(event.target.value)} placeholder="Login no GitHub" className="min-w-0 flex-1" /><Button type="submit" variant="secondary" disabled={busy}>Acompanhar</Button></div></form>
    </>}
    {dialog}
  </div>;
}
