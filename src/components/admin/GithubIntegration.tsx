"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Copy, ExternalLink, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Selo } from "@/components/ui/Selo";
import { IconButton } from "@/components/ui/IconButton";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { SyncStatus } from "@/components/github/SyncStatus";
import { githubFetch } from "@/lib/github/browser";
import { tempoRelativo } from "@/lib/notificacoes/tempo";
import type { IntegrationView, RepositoryView } from "@/lib/github/types";

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

const NOVO_OAUTH_APP = "https://github.com/settings/applications/new";
const CONECTAR = "/api/integrations/github/connect";

const FEITO: Record<string, string> = {
  credentials: "Credenciais salvas.", settings: "Configuração salva. A coleta começa no próximo ciclo.", pause: "Coleta automática pausada.",
  resume: "Coleta automática retomada.", discover: "Lista de repositórios atualizada.", full: "Atualização completa pedida.", disconnect: "GitHub desconectado.",
};

const mesmos = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

/**
 * A integração do GitHub por estado (04/11/2026): sem credenciais, o passo a
 * passo; com credenciais e sem conta, só o Conectar; conectada, a conta, a
 * coleta e os repositórios, com o resto em "Avançado". Era um formulário só,
 * com tudo aberto ao mesmo tempo.
 */
export function GithubIntegration() {
  const { requestConfirm, dialog } = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<IntegrationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emCurso, setEmCurso] = useState<string | null>(null);
  // Rascunhos: `null` é "igual ao salvo", e a releitura a cada 15 s não pisa no que a pessoa está editando.
  const [selecao, setSelecao] = useState<string[] | null>(null);
  const [intervalo, setIntervalo] = useState<number | null>(null);
  const [fuso, setFuso] = useState<string | null>(null);
  // A branch escolhida por repositório (null = a padrão), só a que a pessoa mexeu (12/11/2026).
  const [ramos, setRamos] = useState<Record<string, string | null> | null>(null);
  const [busca, setBusca] = useState("");
  const [trocandoCredenciais, setTrocandoCredenciais] = useState(false);
  const [credenciaisSujas, setCredenciaisSujas] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await githubFetch<IntegrationView>("/api/github/integration", undefined, signal);
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void refresh(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh]);

  // Conectada, a tela relê a situação a cada 15 s (e ao voltar para a aba).
  useEffect(() => {
    if (!data?.connected) return;
    let disposed = false, reading = false;
    const controller = new AbortController();
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

  async function act(action: string, extras: Record<string, unknown> = {}) {
    if (!data) return false;
    setEmCurso(action); setError(null);
    try {
      await githubFetch("/api/github/integration", { action, generation: data.generation, ...extras });
      if (action === "settings" || action === "disconnect") { setSelecao(null); setIntervalo(null); setFuso(null); setRamos(null); }
      await refresh();
      if (FEITO[action]) toast.success(FEITO[action]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
      return false;
    } finally { setEmCurso(null); }
  }

  if (!data) {
    return <div className="space-y-3 text-fs-3">
      {error ? <Aviso>{error}</Aviso> : <p className="text-fg-muted">Carregando…</p>}
      {error && <Button variant="secondary" size="sm" onClick={() => { setError(null); void refresh().catch(err => setError(err.message)); }}>Tentar de novo</Button>}
    </div>;
  }

  const busy = emCurso !== null;
  const avisos = <>
    {error && <Aviso>{error}</Aviso>}
    {data.error && <Aviso tom="atencao">{data.error}</Aviso>}
  </>;

  if (!data.serverReady) {
    return <div className="space-y-3 text-fs-3">
      {avisos}
      <Aviso tom="atencao">A instalação precisa configurar o endereço público e a chave de proteção das credenciais. Fale com o suporte.</Aviso>
    </div>;
  }

  const credenciais = (aoSalvar?: () => void) => (
    <Credenciais data={data} busy={busy} salvando={emCurso === "credentials"} onSujo={setCredenciaisSujas}
      onSalvar={async values => { const ok = await act("credentials", values); if (ok) { setCredenciaisSujas(false); aoSalvar?.(); } return ok; }} />
  );
  // Sem credenciais salvas (estado A) ou com o formulário delas alterado, o Conectar levaria ao app errado.
  const conectar = (rotulo: string) => busy || credenciaisSujas || !data.configured
    ? <Button disabled>{rotulo}</Button>
    : <Button href={CONECTAR} nativo>{rotulo}</Button>;

  // ─── A. Sem credenciais: o passo a passo ─────────────────────────────────
  if (!data.configured) {
    return <div className="space-y-4 text-fs-3">
      {avisos}
      <ol className="space-y-5">
        <Passo n={1} titulo={<a className="inline-flex items-center gap-1 text-brand hover:underline" href={NOVO_OAUTH_APP} target="_blank" rel="noreferrer">Crie o OAuth App no GitHub <ExternalLink size={14} aria-hidden /></a>}>
          <CallbackUrl url={data.callbackUrl} />
          <p className="text-fs-2 text-fg-muted">A autorização pede o escopo <code>repo</code>; o Connect só faz leituras.</p>
        </Passo>
        <Passo n={2} titulo="Informe as credenciais do app">{credenciais()}</Passo>
        <Passo n={3} titulo="Autorize a conta">{conectar("Conectar GitHub")}</Passo>
      </ol>
      {dialog}
    </div>;
  }

  // ─── B. Credenciais salvas, sem conta ou com reconexão pendente ──────────
  if (!data.connected) {
    const reconectar = data.status === "needs_reconnect";
    return <div className="space-y-3 text-fs-3">
      {avisos}
      <Aviso tom={reconectar ? "atencao" : "info"}>
        {reconectar ? `A conta ${data.login ?? "do GitHub"} precisa ser autorizada de novo.` : "Credenciais salvas. Falta autorizar a conta no GitHub."}
      </Aviso>
      <div className="flex flex-wrap items-center gap-2">
        {conectar(reconectar ? "Reconectar GitHub" : "Conectar GitHub")}
        {!trocandoCredenciais && <Button variant="ghost" disabled={busy} onClick={() => setTrocandoCredenciais(true)}>Trocar credenciais</Button>}
      </div>
      {trocandoCredenciais && <TrocaDeCredenciais data={data} onFechar={() => { setTrocandoCredenciais(false); setCredenciaisSujas(false); }}>{credenciais(() => setTrocandoCredenciais(false))}</TrocaDeCredenciais>}
      {dialog}
    </div>;
  }

  // ─── C. Conectada ────────────────────────────────────────────────────────
  const salvos = data.repositories.filter(repo => repo.selected).map(repo => repo.id);
  const selecionados = selecao ?? salvos;
  const minutos = intervalo ?? data.intervalMinutes;
  const fusoAtual = fuso ?? data.timezone;
  const branchDe = (repo: RepositoryView) => ramos && repo.id in ramos ? ramos[repo.id] : repo.branch;
  const ramosMudados = Object.fromEntries(data.repositories.filter(repo => selecionados.includes(repo.id) && branchDe(repo) !== repo.branch).map(repo => [repo.id, branchDe(repo)]));
  const mudou = !mesmos(selecionados, salvos) || minutos !== data.intervalMinutes || fusoAtual !== data.timezone || Object.keys(ramosMudados).length > 0;
  const termo = busca.trim().toLowerCase();
  // Selecionados primeiro, pela seleção salva: a lista não pula enquanto se marca.
  const visiveis = data.repositories
    .filter(repo => repo.fullName.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.selected) - Number(a.selected));
  const comErro = Boolean(data.error) || data.progress?.state === "error";
  const ultima = data.progress?.lastActivityAt;

  return <div className="space-y-5 text-fs-3">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-fg">Conectado como <strong className="font-semibold">{data.login}</strong></span>
        <Selo tom={comErro ? "perigo" : data.enabled ? "sucesso" : "neutro"}>{comErro ? "Com erro" : data.enabled ? "Sincronizando" : "Pausada"}</Selo>
        <span className="text-fs-2 text-fg-muted">{ultima ? `última coleta ${tempoRelativo(new Date(ultima))}` : "nenhuma coleta ainda"}</span>
      </div>
      <Switch rotulo="Coleta automática" checked={data.enabled} disabled={busy || !data.enabled && salvos.length === 0}
        onCheckedChange={ligar => void act(ligar ? "resume" : "pause")} />
    </div>
    {avisos}
    <SyncStatus progress={data.progress} timezone={data.timezone} />

    <section className="space-y-2" aria-labelledby="github-repositorios">
      <div className="flex items-center justify-between gap-2">
        <h3 id="github-repositorios" className="font-medium text-fg">Repositórios <span className="font-normal text-fg-muted">· {selecionados.length} de {data.repositories.length}</span></h3>
        <IconButton title="Atualizar lista" disabled={busy} onClick={() => void act("discover")}>
          <RefreshCw size={15} className={emCurso === "discover" ? "animate-spin motion-reduce:animate-none" : undefined} />
        </IconButton>
      </div>
      {data.repositories.length > 8 && <CampoDeBusca aria-label="Buscar repositório" placeholder="Buscar repositório…" value={busca} onChange={event => setBusca(event.target.value)} />}
      <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {!visiveis.length && <p className="p-3 text-fg-muted">{data.pending && !data.inventoryAt ? "Buscando repositórios…" : "Nenhum repositório encontrado."}</p>}
        {visiveis.map(repo => {
          const tags = [repo.private && "Privado", repo.fork && "Fork", repo.archived && "Arquivado"].filter(Boolean) as string[];
          const marcado = selecionados.includes(repo.id);
          return <div key={repo.id} className="px-3 py-2 hover:bg-surface-hover">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox className="mt-0.5" checked={marcado} disabled={busy || !repo.accessible && !repo.selected}
                onChange={event => setSelecao(event.target.checked ? [...selecionados, repo.id] : selecionados.filter(id => id !== repo.id))} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="break-all text-fg">{repo.fullName}</span>
                  {tags.map(tag => <span key={tag} className="text-fs-1 text-fg-muted">{tag}</span>)}
                  {!repo.accessible && <span className="text-fs-1 text-warning-fg">Sem acesso</span>}
                </span>
                {repo.error && <span className="block text-fs-2 text-warning-fg">{repo.error}</span>}
              </span>
            </label>
            {marcado && <BranchDoRepositorio repo={repo} branch={branchDe(repo)} disabled={busy}
              onChange={branch => setRamos(atual => ({ ...atual, [repo.id]: branch }))} />}
          </div>;
        })}
      </div>
    </section>

    <BlocoRecolhivel titulo="Avançado" classeDoConteudo="space-y-4 px-4 pb-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoForm label="Atualizar a cada (minutos)" htmlFor="github-intervalo" helper="De 10 a 1440.">
          <CampoNumero id="github-intervalo" min={10} max={1440} value={String(minutos)} onChange={event => setIntervalo(Number(event.target.value))} />
        </CampoForm>
        <CampoForm label="Fuso dos dias" htmlFor="github-fuso" helper="Fica fixo após a primeira coleta.">
          <Select id="github-fuso" value={fusoAtual} onChange={event => setFuso(event.target.value)}>
            {[...new Set([fusoAtual, ...FUSOS.map(f => f[0])])].map(f => <option key={f} value={f}>{FUSOS.find(x => x[0] === f)?.[1] ?? f}</option>)}
          </Select>
        </CampoForm>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={busy || !data.enabled} loading={emCurso === "full"} loadingLabel="Pedindo…"
          onClick={() => requestConfirm({ title: "Forçar atualização completa?", description: "Os repositórios selecionados serão consultados de novo nos últimos 12 meses. Demora mais e consome mais do limite da API do GitHub.", confirmLabel: "Forçar atualização" }, async () => { await act("full"); })}>
          Forçar atualização completa
        </Button>
        {!trocandoCredenciais && <Button variant="secondary" size="sm" disabled={busy} onClick={() => setTrocandoCredenciais(true)}>Trocar credenciais do OAuth App</Button>}
        <Button variant="danger" size="sm" disabled={busy} loading={emCurso === "disconnect"} loadingLabel="Desconectando…"
          onClick={() => requestConfirm({ title: "Desconectar GitHub?", description: "A coleta para e a tela de contribuições fica sem dados novos. O histórico é preservado.", confirmLabel: "Desconectar", destructive: true }, async () => { await act("disconnect"); })}>
          Desconectar
        </Button>
      </div>
      {trocandoCredenciais && <TrocaDeCredenciais data={data} onFechar={() => { setTrocandoCredenciais(false); setCredenciaisSujas(false); }}>{credenciais(() => setTrocandoCredenciais(false))}</TrocaDeCredenciais>}
    </BlocoRecolhivel>

    {mudou && <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-1 py-3">
      <Button variant="ghost" disabled={busy} onClick={() => { setSelecao(null); setIntervalo(null); setFuso(null); setRamos(null); }}>Descartar</Button>
      <Button disabled={busy} loading={emCurso === "settings"} loadingLabel="Salvando…"
        onClick={() => void act("settings", { repositories: selecionados, timezone: fusoAtual, intervalMinutes: minutos, branches: ramosMudados })}>Salvar e sincronizar</Button>
    </div>}
    {dialog}
  </div>;
}

type Branches = { defaultBranch: string; branch: string | null; branches: string[] };

/**
 * A branch que a coleta de commits lê no repositório marcado (12/11/2026). Por padrão
 * é a padrão do repositório (a main); "Trocar" busca as branches no GitHub só quando
 * a pessoa pede, para não consultar todos os repositórios ao abrir a tela.
 */
function BranchDoRepositorio({ repo, branch, disabled, onChange }: {
  repo: RepositoryView; branch: string | null; disabled: boolean; onChange: (branch: string | null) => void;
}) {
  const [lista, setLista] = useState<string[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atual = branch ?? repo.defaultBranch;
  const id = useId();

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      const result = await githubFetch<Branches>(`/api/github/integration?branches=${encodeURIComponent(repo.id)}`);
      setLista(result.branches.includes(atual) ? result.branches : [...result.branches, atual]);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível buscar as branches."); }
    finally { setCarregando(false); }
  }

  return <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-2">
    <GitBranch size={13} className="text-fg-muted" aria-hidden />
    {lista ? <>
      <label htmlFor={id} className="sr-only">Branch de {repo.fullName}</label>
      <Select id={id} compact value={atual} disabled={disabled}
        onChange={event => onChange(event.target.value === repo.defaultBranch ? null : event.target.value)}>
        {lista.map(nome => <option key={nome} value={nome}>{nome === repo.defaultBranch ? `${nome} (padrão)` : nome}</option>)}
      </Select>
    </> : <>
      <span className="text-fg-secondary">Branch <strong className="font-medium text-fg">{atual}</strong>{atual === repo.defaultBranch && <span className="text-fg-muted"> (padrão)</span>}</span>
      <Button variant="link" size="sm" disabled={disabled || carregando} loading={carregando} loadingLabel="Buscando…" onClick={() => void carregar()}>Trocar</Button>
    </>}
    {erro && <span className="basis-full text-warning-fg">{erro}</span>}
  </div>;
}

function Passo({ n, titulo, children }: { n: number; titulo: React.ReactNode; children: React.ReactNode }) {
  return <li className="flex gap-3">
    <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-fs-2 font-semibold text-fg-secondary">{n}</span>
    <div className="min-w-0 flex-1 space-y-2 pt-0.5">
      <p className="font-medium text-fg">{titulo}</p>
      {children}
    </div>
  </li>;
}

function CallbackUrl({ url }: { url: string | null }) {
  const toast = useToast();
  const id = useId();
  if (!url) return null;
  return <div className="space-y-1">
    <label htmlFor={id} className="block text-fs-2 text-fg-secondary">Authorization callback URL</label>
    <div className="flex gap-2">
      <Input id={id} readOnly value={url} className="min-w-0 flex-1" onFocus={event => event.target.select()} />
      <IconButton title="Copiar o endereço" variant="framed" size="lg"
        onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Endereço copiado."), () => toast.error("Não foi possível copiar. Selecione e copie o endereço."))}>
        <Copy size={15} />
      </IconButton>
    </div>
  </div>;
}

function TrocaDeCredenciais({ data, onFechar, children }: { data: IntegrationView; onFechar: () => void; children: React.ReactNode }) {
  return <div className="space-y-3 rounded-lg border border-border p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="font-medium text-fg">Credenciais do OAuth App</p>
      <Button variant="link" size="sm" onClick={onFechar}>Cancelar</Button>
    </div>
    <CallbackUrl url={data.callbackUrl} />
    {data.login && <p className="text-fs-2 text-fg-muted">Ao trocar, a conta precisa ser autorizada de novo. O histórico é preservado.</p>}
    {children}
  </div>;
}

function Credenciais({ data, busy, salvando, onSujo, onSalvar }: {
  data: IntegrationView; busy: boolean; salvando: boolean;
  onSujo: (sujo: boolean) => void; onSalvar: (values: { clientId: string; clientSecret: string }) => Promise<boolean>;
}) {
  const [clientId, setClientId] = useState(data.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const editar = (fn: () => void) => { fn(); onSujo(true); };
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); void onSalvar({ clientId, clientSecret }).then(ok => { if (ok) setClientSecret(""); }); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1"><span className="text-fs-2 text-fg-secondary">Client ID</span>
        <Input required maxLength={255} autoComplete="off" value={clientId} disabled={busy} onChange={event => editar(() => setClientId(event.target.value))} /></label>
      <label className="space-y-1"><span className="text-fs-2 text-fg-secondary">Client Secret</span>
        <Input type="password" required={!data.hasClientSecret || clientId.trim() !== data.clientId} maxLength={1024} autoComplete="new-password" value={clientSecret} disabled={busy}
          placeholder={data.hasClientSecret ? "Salvo — deixe vazio para manter" : ""} onChange={event => editar(() => setClientSecret(event.target.value))} /></label>
    </div>
    <Button type="submit" variant="secondary" size="sm" disabled={busy} loading={salvando} loadingLabel="Salvando…">Salvar</Button>
  </form>;
}
