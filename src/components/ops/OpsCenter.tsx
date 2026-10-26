"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Copy, FileText, FolderInput, FolderOutput, History, KeyRound, Pencil, Plus, RefreshCw, Search, UserRound, XCircle } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatInstantDateTime } from "@/lib/format";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { atividade, caminhoDoEvento, ROTULOS_OPS } from "@/lib/ops/regras";
import type { EventoOps, PainelOps, WatcherOps } from "@/lib/ops/tipos";
import styles from "./OpsCenter.module.css";

const COR: Record<EventoOps["status"], TomDoSelo> = { SUCCESS: "sucesso", ERROR: "perigo", WARNING: "atencao" };
const data = (iso: string | null) => iso ? formatInstantDateTime(new Date(iso)) : "—";
const nomeArquivo = (p: string) => p.split(/[\\/]/).pop() || p;
const numero = (n: number) => Number(n).toLocaleString("pt-BR");
type Situacao = "online" | "unstable" | "offline";
const SITUACOES: Record<Situacao, { label: string; cor: string }> = {
  online: { label: "Online", cor: "text-success-fg" },
  unstable: { label: "Instável", cor: "text-warning-fg" },
  offline: { label: "Offline", cor: "text-danger" },
};
function situacao(w: WatcherOps, agora: number): Situacao {
  const sinal = atividade(w.lastHeartbeatAt, w.isActive, agora);
  if (sinal !== "Em execução") return "offline";
  return w.instabilityReportedAt ? "unstable" : "online";
}
const iniciais = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).map(p => p[0]).filter((_, i, partes) => i === 0 || i === partes.length - 1).join("").toLocaleUpperCase("pt-BR");
const emBranco = { slug: "", name: "", ownerId: "", description: "", client: "", folderInput: "", folderOutput: "", isActive: true };
type Formulario = typeof emBranco;
async function gravar(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível salvar. Atualize e tente novamente.");
  return result as { token?: string | null };
}

export function OpsCenter({ podeGerir }: { podeGerir: boolean }) {
  const params = useSearchParams(), toast = useToast();
  const [painel, setPainel] = useState<PainelOps | null>(null);
  const [watcher, setWatcher] = useState(params.get("watcher") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [dia, setDia] = useState(params.get("date") ?? "");
  const [minhas, setMinhas] = useState(params.get("mine") === "1");
  const [visao, setVisao] = useState<"automations" | "history">(() => {
    const inicial = params.get("view");
    if (inicial === "automations" || inicial === "history") return inicial;
    return params.has("watcher") || params.has("status") || params.has("date") || Number(params.get("page")) > 1 ? "history" : "automations";
  });
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"all" | "online" | "unstable" | "offline">("all");
  const [pagina, setPagina] = useState(Math.max(1, Math.min(100000, Number.parseInt(params.get("page") ?? "1", 10) || 1))), [loading, setLoading] = useState(true), [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false), [erroAcao, setErroAcao] = useState("");
  const [edicao, setEdicao] = useState<WatcherOps | "novo" | null>(null), [form, setForm] = useState<Formulario>(emBranco);
  const [instabilidade, setInstabilidade] = useState<WatcherOps | null>(null), [nota, setNota] = useState(""), [chamado, setChamado] = useState("");
  const [detalhe, setDetalhe] = useState<EventoOps | null>(null);
  const requisicao = useRef<AbortController | null>(null);
  const query = new URLSearchParams({ page: String(pagina), ...(watcher ? { watcher } : {}), ...(status ? { status } : {}), ...(dia ? { date: dia } : {}), ...(minhas ? { mine: "1" } : {}) }).toString();

  const atualizar = useCallback(async () => {
    requisicao.current?.abort();
    const controller = new AbortController(); requisicao.current = controller;
    const limite = window.setTimeout(() => controller.abort("timeout"), 15000);
    setLoading(true);
    try {
      const response = await fetch(`/api/ops?${query}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar.");
      if (requisicao.current !== controller) return;
      setPainel(result); setErro("");
    } catch (err) {
      if (requisicao.current === controller && (!controller.signal.aborted || controller.signal.reason === "timeout")) {
        setErro(err instanceof Error && err.name !== "AbortError" ? err.message : "A atualização demorou demais. Tente novamente.");
      }
    } finally { window.clearTimeout(limite); if (requisicao.current === controller) setLoading(false); }
  }, [query]);

  useEffect(() => {
    const inicial = window.setTimeout(() => void atualizar(), 0);
    const intervalo = window.setInterval(() => { if (!document.hidden) void atualizar(); }, 30000);
    const visivel = () => { if (!document.hidden) void atualizar(); };
    document.addEventListener("visibilitychange", visivel);
    return () => { requisicao.current?.abort(); requisicao.current = null; window.clearTimeout(inicial); window.clearInterval(intervalo); document.removeEventListener("visibilitychange", visivel); };
  }, [atualizar]);

  // O recorte fica no endereço para os links do sino abrirem o erro certo.
  useEffect(() => { window.history.replaceState(null, "", `/ops?${query}&view=${visao}`); }, [query, visao]);

  async function copiar(texto: string, aviso = "Copiado.") {
    try { await navigator.clipboard.writeText(texto); toast.success(aviso); }
    catch { toast.error("Não foi possível copiar. Selecione e copie o texto manualmente."); }
  }
  function editar(w: WatcherOps | "novo") {
    setErroAcao(""); setEdicao(w);
    setForm(w === "novo" ? emBranco : { slug: w.slug, name: w.name, ownerId: w.ownerId ?? "", description: w.description ?? "", client: w.client ?? "", folderInput: w.folderInput ?? "", folderOutput: w.folderOutput ?? "", isActive: w.isActive });
  }
  async function agir(fn: () => Promise<void>) {
    setOcupado(true); setErroAcao("");
    try { await fn(); await atualizar(); }
    catch (err) { setErroAcao(err instanceof Error ? err.message : "Não foi possível concluir."); }
    finally { setOcupado(false); }
  }
  const copiarCaminho = (e: EventoOps) => <IconButton size="sm" type="button" aria-label={`Copiar caminho de ${nomeArquivo(e.filenameRenamed || e.filename)}`} title="Copiar caminho"
    onClick={() => void copiar(caminhoDoEvento(e, painel?.watchers.find(w => w.slug === e.watcherSlug)), "Caminho copiado.")}><Copy size={14} /></IconButton>;
  const endpoint = (w: WatcherOps) => `/api/ops/watchers/${encodeURIComponent(w.slug)}`;
  const summary = painel?.summary;
  const totalPaginas = painel ? Math.max(1, Math.ceil(painel.total / painel.pageSize)) : 1;
  const paginaAtual = painel?.page ?? pagina;
  const agora = painel ? new Date(painel.serverTime).getTime() : 0;
  const online = painel?.watchers.filter(w => atividade(w.lastHeartbeatAt, w.isActive, agora) === "Em execução").length ?? 0;
  const termo = busca.toLocaleLowerCase("pt-BR").trim();
  const automacoes = painel?.watchers.filter(w => (
    !termo || [w.name, w.ownerName, w.description, w.client, w.slug].some(v => v?.toLocaleLowerCase("pt-BR").includes(termo))
  ) && (filtroSituacao === "all" || situacao(w, agora) === filtroSituacao)) ?? [];
  const atualizarCampo = (key: keyof Formulario, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  const botoesDePasta = (w: WatcherOps) => <div className="grid grid-cols-2 gap-2">
    <Button size="sm" variant="secondary" title={w.folderInput ? `Copiar caminho: ${w.folderInput}` : "Pasta de entrada não configurada"} disabled={!w.folderInput} onClick={() => void copiar(w.folderInput!, "Caminho copiado.")}><FolderInput size={14} /> Entrada</Button>
    <Button size="sm" variant="secondary" title={w.folderOutput ? `Copiar caminho: ${w.folderOutput}` : "Pasta de saída não configurada"} disabled={!w.folderOutput} onClick={() => void copiar(w.folderOutput!, "Caminho copiado.")}><FolderOutput size={14} /> Saída</Button>
  </div>;

  return <PageContainer>
    <PageHeader title="Ops Center" subtitle="Acompanhe a saúde e os resultados das suas automações."
      meta={<span>{painel ? `Atualizado em ${data(painel.serverTime)} · atualização a cada 30 segundos` : "Carregando o painel…"}</span>} />
    {/* O resumo saiu da ação do cabeçalho para a faixa de números do app: lá ele
        pedia largura fixa (`100vw-3rem`) para caber no celular (26/10/2026). */}
    <FaixaDeTotais destaque={false} itens={[
      { rotulo: "Online agora", valor: painel ? numero(online) : "—", detalhe: painel ? `de ${numero(painel.watchers.length)} automações` : undefined },
      { rotulo: "Processados hoje", valor: summary ? numero(summary.total) : "—" },
      { rotulo: "Com erro", valor: summary ? numero(summary.error) : "—", tom: summary?.error ? "text-danger" : undefined },
    ]} />

    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl label="Visualizações do Ops Center" active={visao} onChange={setVisao} tone="brand" items={[
        { key: "automations", label: "Automações", icon: <Activity size={14} /> },
        { key: "history", label: "Histórico", icon: <History size={14} />, contagem: painel?.total },
      ]} />
      <div className="flex flex-wrap gap-2">
        {podeGerir && <Button size="sm" variant="secondary" href="/admin/integracoes?integracao=ops_center"><KeyRound size={14} /> Integração dos bots</Button>}
        <Button size="sm" variant="secondary" onClick={() => void atualizar()} disabled={loading}><RefreshCw size={14} className={loading ? "motion-safe:animate-spin" : ""} /> Atualizar</Button>
        {podeGerir && <Button size="sm" onClick={() => editar("novo")}><Plus size={14} /> Nova automação</Button>}
      </div>
    </div>

    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl label="Automações por responsável" active={minhas ? "mine" : "all"} onChange={value => { setMinhas(value === "mine"); setWatcher(""); setPagina(1); }} items={[
        { key: "all", label: "Todas" }, { key: "mine", label: "Minhas automações", icon: <UserRound size={14} /> },
      ]} />
      {summary && <p className="flex flex-wrap gap-x-4 gap-y-1 text-helper text-fg-secondary">
        <span><strong className="font-semibold text-success-fg">{numero(summary.success)}</strong> sucessos hoje</span>
        <span><strong className={summary.warning ? "font-semibold text-warning-fg" : "font-semibold"}>{numero(summary.warning)}</strong> avisos</span>
        <span>Taxa de sucesso: <strong className="font-semibold text-fg">{summary.successRate === null ? "—" : `${numero(summary.successRate)}%`}</strong></span>
      </p>}
    </div>

    {erro && <Aviso className="mb-5">{erro} {painel && "Os dados abaixo são da última atualização recebida."} <Button variant="link" onClick={() => void atualizar()}>Tentar novamente</Button></Aviso>}
    {!painel && !erro && <Card className="p-8 text-center text-fg-secondary" role="status">Carregando automações e resultados…</Card>}
    {painel && <>
      {visao === "automations" ? <section aria-labelledby="ops-automacoes">
        <Card className="mb-5 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="block w-full lg:max-w-sm"><span className="sr-only">Buscar automação</span><Input compact type="search" icon={<Search size={16} />} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou responsável…" /></label>
          <div className="max-w-full overflow-x-auto p-1">
            <SegmentedControl label="Filtrar automações por status" active={filtroSituacao} onChange={setFiltroSituacao} items={[
              { key: "all", label: "Todos" }, { key: "online", label: "Online", tone: "success" },
              { key: "unstable", label: "Instável", tone: "warning" }, { key: "offline", label: "Offline", tone: "danger" },
            ]} />
          </div>
        </Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="ops-automacoes" className="text-section-title font-semibold text-fg">Automações</h2><span className="text-helper text-fg-muted" role="status">{numero(automacoes.length)} de {numero(painel.watchers.length)} automações{minhas ? " · sob sua responsabilidade" : ""}</span></div>
        {!painel.watchers.length ? <Card><EmptyState icon={<Activity />} title={minhas ? "Nenhuma automação atribuída a você" : "Nenhuma automação cadastrada"} description={minhas ? "O gestor pode definir o dono de cada automação no cadastro." : "Cadastre a automação e configure o envio de atividade e resultados para começar."}
            action={podeGerir && !minhas ? <Button onClick={() => editar("novo")}><Plus size={14} /> Nova automação</Button> : undefined} /></Card> :
          !automacoes.length ? <Card><EmptyState icon={<Search />} title="Nenhuma automação encontrada" description="Tente ajustar sua busca ou o filtro de status."
            action={<Button variant="secondary" onClick={() => { setBusca(""); setFiltroSituacao("all"); }}>Limpar busca e status</Button>} /></Card> :
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{automacoes.map(w => {
            const estado = situacao(w, agora), sinal = SITUACOES[estado];
            return <Card role="article" key={w.slug} className={`flex min-w-0 flex-col p-5 transition-[border-color,box-shadow] hover:border-brand/30 hover:shadow-md ${w.instabilityReportedAt ? "border-warning/50" : ""}`}>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`mb-2 flex items-center gap-2 text-helper font-semibold ${sinal.cor}`}><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full bg-current ${estado === "online" || estado === "unstable" ? styles.statusDot : ""}`} />{sinal.label}</p>
                  <h3 className="break-words text-section-title font-semibold leading-snug text-fg">{w.name}</h3>
                  <p className="mt-1 break-words text-helper text-fg-muted">{w.client || w.slug}</p>
                </div>
                {podeGerir && <Button size="icon" variant="secondary" aria-label={`Editar ${w.name}`} title="Editar automação" onClick={() => editar(w)}><Pencil size={15} /></Button>}
              </div>
              <div className="mb-4 flex items-center gap-2.5">
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-helper font-semibold text-brand">{w.ownerName ? iniciais(w.ownerName) : <UserRound size={16} />}</span>
                <div className="min-w-0"><p className="text-helper text-fg-muted">Responsável</p><p className="break-words text-ui font-medium text-fg-secondary">{w.ownerName || "Sem responsável"}</p></div>
              </div>
              <p className="min-h-10 flex-1 break-words text-ui leading-relaxed text-fg-secondary">{w.description || "Sem descrição cadastrada."}</p>
              <div className="my-4 grid grid-cols-2 divide-x divide-border rounded-lg bg-surface-2 py-3">
                <div className="min-w-0 px-3"><p className="mb-1.5 flex items-center gap-1.5 text-helper text-fg-secondary"><CheckCircle2 size={14} className="shrink-0 text-success-fg" /> Sucessos</p><strong className="text-section-title font-semibold tabular-nums text-fg">{numero(w.successToday)}</strong><span className="ml-1 text-helper text-fg-muted">hoje</span></div>
                <div className="min-w-0 px-3"><p className="mb-1.5 flex items-center gap-1.5 text-helper text-fg-secondary"><XCircle size={14} className="shrink-0 text-danger" /> Erros</p><strong className={`text-section-title font-semibold tabular-nums ${w.errorToday ? "text-danger" : "text-fg"}`}>{numero(w.errorToday)}</strong><span className="ml-1 text-helper text-fg-muted">hoje</span></div>
              </div>
              <p className="mb-2 text-helper text-fg-muted">{numero(w.totalToday)} processados hoje · último sinal: {data(w.lastHeartbeatAt)}</p>
              {w.lastEvent && <button type="button" className="mb-3 block w-full rounded-md border border-border p-2.5 text-left text-helper transition-colors hover:bg-surface-hover" onClick={() => setDetalhe(w.lastEvent)}><span className="flex flex-wrap items-center gap-2"><Selo tom={COR[w.lastEvent.status]}>{ROTULOS_OPS[w.lastEvent.status]}</Selo><span className="text-fg-muted">{data(w.lastEvent.processedAt)}</span></span><span className="mt-2 block truncate text-fg" title={w.lastEvent.filename}>{nomeArquivo(w.lastEvent.filenameRenamed || w.lastEvent.filename)}</span></button>}
              {w.instabilityReportedAt && <div className="mb-3 rounded-md bg-warning-bg p-3 text-helper text-warning-fg"><p className="mb-1 font-semibold">Instabilidade sinalizada</p><p className="whitespace-pre-wrap break-words">{w.instabilityNote}</p><p className="mt-2 break-words">{w.instabilityReportedByName} · {data(w.instabilityReportedAt)}</p>{w.instabilityTicketId && <Button variant="link" href={`/chamados/${encodeURIComponent(w.instabilityTicketId)}`} className="mt-2">Ver chamado</Button>}</div>}
              <div className="mt-auto pt-1">{botoesDePasta(w)}</div>
              {podeGerir && <div className="mt-3 border-t border-border pt-3">
                <Button size="xs" variant="ghost" onClick={() => { setInstabilidade(w); setNota(w.instabilityNote ?? ""); setChamado(w.instabilityTicketId ?? ""); setErroAcao(""); }}><AlertTriangle size={13} /> {w.instabilityReportedAt ? "Revisar instabilidade" : "Sinalizar instabilidade"}</Button>
              </div>}
            </Card>;
          })}</div>}
        <p className="mt-4 text-helper leading-relaxed text-fg-muted">Offline indica recebimento desativado, nenhum sinal recebido ou ausência de sinal há pelo menos 3 minutos. Instável indica uma sinalização em aberto com comunicação ativa. Entrada e Saída copiam os caminhos para abrir no Explorador de Arquivos. Contadores do dia no horário de Brasília.</p>
      </section> :

      <section aria-labelledby="ops-historico">
        <Card className="overflow-hidden">
          <div className="flex items-start gap-3 border-b border-border p-5"><span aria-hidden className="rounded-md bg-brand-subtle p-2 text-brand"><History size={18} /></span><div><h2 id="ops-historico" className="text-section-title font-semibold text-fg">Histórico de processamento</h2><p className="mt-1 text-helper text-fg-secondary">Últimos arquivos processados pelas automações, do mais recente para o mais antigo.</p></div></div>
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <CampoForm label="Automação" htmlFor="ops-filtro-automacao"><Select id="ops-filtro-automacao" compact value={watcher} onChange={e => { setWatcher(e.target.value); setPagina(1); }}><option value="">Todas as automações</option>{painel.watchers.map(w => <option key={w.slug} value={w.slug}>{w.name}</option>)}</Select></CampoForm>
            <CampoForm label="Resultado" htmlFor="ops-filtro-resultado"><Select id="ops-filtro-resultado" compact value={status} onChange={e => { setStatus(e.target.value); setPagina(1); }}><option value="">Todos os resultados</option><option value="SUCCESS">Sucesso</option><option value="ERROR">Erro</option><option value="WARNING">Aviso</option></Select></CampoForm>
            <CampoForm label="Data do processamento" htmlFor="ops-filtro-data"><CampoData id="ops-filtro-data" compact value={dia} onChange={value => { setDia(value); setPagina(1); }} /></CampoForm>
            <div className="flex items-end"><Button variant="ghost" size="sm" onClick={() => { setWatcher(""); setStatus(""); setDia(""); setPagina(1); }}>Limpar filtros</Button></div>
          </div>
          <div className="hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label="Eventos de processamento"><table className="w-full text-left text-ui">
            <thead className="border-b border-border bg-surface-2 text-helper text-fg-secondary"><tr>{["Data e hora", "Automação", "Arquivo", "Resultado", "Cliente", "Detalhes"].map(t => <th key={t} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{painel.events.map(e => <tr key={e.id} className="hover:bg-surface-hover"><td className="whitespace-nowrap px-4 py-3 text-fg-secondary">{data(e.processedAt)}</td><td className="px-4 py-3 text-fg">{e.watcherName}</td><td className="max-w-72 px-4 py-3"><span className="flex min-w-0 items-center gap-1"><span className="min-w-0 truncate text-fg" title={caminhoDoEvento(e, painel.watchers.find(w => w.slug === e.watcherSlug))}>{nomeArquivo(e.filenameRenamed || e.filename)}</span>{copiarCaminho(e)}</span></td><td className="px-4 py-3"><Selo tom={COR[e.status]}>{ROTULOS_OPS[e.status]}</Selo></td><td className="px-4 py-3 text-fg-secondary">{e.client || "—"}</td><td className="px-4 py-3"><Button variant="link" onClick={() => setDetalhe(e)}>Ver detalhes</Button></td></tr>)}</tbody>
          </table></div>
          <div className="divide-y divide-border md:hidden">{painel.events.map(e => <article key={e.id} className="min-w-0 p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-ui font-semibold text-fg">{e.watcherName}</h3><p className="mt-1 text-helper text-fg-muted">{data(e.processedAt)}</p></div><Selo tom={COR[e.status]}>{ROTULOS_OPS[e.status]}</Selo></div>
            <div className="mt-3 flex w-full min-w-0 items-center gap-2 rounded-md bg-surface-2 py-1 pl-2.5 pr-1 text-ui text-fg" title={caminhoDoEvento(e, painel.watchers.find(w => w.slug === e.watcherSlug))}><FileText size={14} className="shrink-0 text-fg-muted" /><span className="min-w-0 flex-1 truncate">{nomeArquivo(e.filenameRenamed || e.filename)}</span>{copiarCaminho(e)}</div>
            <div className="mt-3 flex items-center justify-between gap-3 text-helper"><span className="min-w-0 break-words text-fg-secondary">{e.client || "Sem cliente informado"}</span><Button variant="link" className="shrink-0" onClick={() => setDetalhe(e)}>Ver detalhes</Button></div>
          </article>)}</div>
          {!painel.events.length && <EmptyState icon={<History />} title="Nenhum evento encontrado" description="Nenhum processamento neste recorte. Ajuste os filtros ou aguarde o próximo envio das automações." />}
          {totalPaginas > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-helper text-fg-secondary"><span>{painel.total} eventos · página {paginaAtual} de {totalPaginas}</span><div className="flex gap-2"><Button size="sm" variant="secondary" aria-label="Página anterior" disabled={loading || paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}><ChevronLeft size={15} /> Anterior</Button><Button size="sm" variant="secondary" aria-label="Próxima página" disabled={loading || paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima <ChevronRight size={15} /></Button></div></div>}
        </Card>
      </section>}
    </>}

    <Modal open={!!edicao} onClose={() => { if (!ocupado) setEdicao(null); }} title={edicao === "novo" ? "Nova automação" : "Editar automação"} maxWidth="max-w-xl">
      <form className="mt-3 space-y-4" onSubmit={e => { e.preventDefault(); void agir(async () => {
        await gravar(edicao === "novo" ? "/api/ops/watchers" : endpoint(edicao!), edicao === "novo" ? "POST" : "PATCH", { ...form, ...(edicao !== "novo" && edicao ? { version: edicao.version } : {}) });
        setEdicao(null); toast.success("Automação salva.");
      }); }}>
        <div className="grid gap-4 sm:grid-cols-2"><CampoForm label="Nome" htmlFor="ops-nome" required><Input id="ops-nome" required maxLength={120} value={form.name} onChange={e => atualizarCampo("name", e.target.value)} /></CampoForm><CampoForm label="Identificador" htmlFor="ops-identificador" required helper={edicao === "novo" ? "Letras minúsculas, números, - ou _ (sem começar ou terminar com - ou _)." : "O identificador não muda depois do cadastro."}><Input id="ops-identificador" required maxLength={60} pattern="[a-z0-9]+([-_][a-z0-9]+)*" title="Letras minúsculas, números, - ou _" disabled={edicao !== "novo"} value={form.slug} placeholder="ex.: dominio_xls_to_txt" onChange={e => atualizarCampo("slug", e.target.value)} /></CampoForm></div>
        <CampoForm label="Dono da automação" htmlFor="ops-dono" helper="O responsável recebe uma notificação no Connect quando a automação registra um erro."><Select id="ops-dono" value={form.ownerId} onChange={e => atualizarCampo("ownerId", e.target.value)}><option value="">Sem responsável</option>{form.ownerId && !painel?.owners.some(u => u.id === form.ownerId) && <option value={form.ownerId}>Responsável indisponível — selecione outro</option>}{painel?.owners.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></CampoForm>
        <CampoForm label="Cliente ou grupo" htmlFor="ops-cliente"><Input id="ops-cliente" maxLength={120} value={form.client} onChange={e => atualizarCampo("client", e.target.value)} /></CampoForm>
        <CampoForm label="Descrição" htmlFor="ops-descricao"><Textarea id="ops-descricao" maxLength={1000} value={form.description} onChange={e => atualizarCampo("description", e.target.value)} /></CampoForm>
        <CampoForm label="Pasta de entrada" htmlFor="ops-pasta-entrada"><Input id="ops-pasta-entrada" maxLength={1000} value={form.folderInput} onChange={e => atualizarCampo("folderInput", e.target.value)} /></CampoForm>
        <CampoForm label="Pasta de saída" htmlFor="ops-pasta-saida"><Input id="ops-pasta-saida" maxLength={1000} value={form.folderOutput} onChange={e => atualizarCampo("folderOutput", e.target.value)} /></CampoForm>
        <Checkbox label="Recebimento ativo" checked={form.isActive} onChange={e => atualizarCampo("isActive", e.target.checked)} />
        {!form.isActive && <p className="text-helper text-warning-fg">Ao desativar, a chave atual será revogada. O histórico permanece disponível.</p>}
        {erroAcao && <p role="alert" className="text-ui text-danger">{erroAcao}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={ocupado} onClick={() => setEdicao(null)}>Cancelar</Button><Button type="submit" loading={ocupado}>Salvar automação</Button></div>
      </form>
    </Modal>

    <Modal open={!!instabilidade} onClose={() => { if (!ocupado) setInstabilidade(null); }} title="Instabilidade da automação" maxWidth="max-w-xl">
      {instabilidade && <form className="mt-3 space-y-4" onSubmit={e => { e.preventDefault(); void agir(async () => {
        await gravar(`${endpoint(instabilidade)}/instability`, "POST", { version: instabilidade.version, note: nota, ticketId: chamado });
        const revisao = !!instabilidade.instabilityReportedAt; setInstabilidade(null); toast.success(revisao ? "Instabilidade atualizada." : "Instabilidade sinalizada.");
      }); }}><p className="font-semibold text-fg">{instabilidade.name}</p><CampoForm label="O que aconteceu?" htmlFor="ops-instabilidade-nota" required><Textarea id="ops-instabilidade-nota" required minLength={3} maxLength={2000} value={nota} onChange={e => setNota(e.target.value)} /></CampoForm><CampoForm label="ID do chamado" htmlFor="ops-instabilidade-chamado" helper="Opcional."><Input id="ops-instabilidade-chamado" maxLength={191} value={chamado} onChange={e => setChamado(e.target.value)} placeholder="ID do chamado já aberto no Connect" /></CampoForm><p className="text-helper text-fg-secondary">Você pode <Button variant="link" href="/chamados/novo" target="_blank" rel="noopener noreferrer">abrir um chamado</Button> e vincular o ID aqui.</p>
        {erroAcao && <p role="alert" className="text-ui text-danger">{erroAcao}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" type="button" disabled={ocupado} onClick={() => setInstabilidade(null)}>Cancelar</Button>{instabilidade.instabilityReportedAt && <Button type="button" variant="success" disabled={ocupado} onClick={() => void agir(async () => { await gravar(`${endpoint(instabilidade)}/instability`, "DELETE", { version: instabilidade.version }); setInstabilidade(null); toast.success("Sinalização de instabilidade resolvida."); })}>Marcar como resolvida</Button>}<Button type="submit" loading={ocupado}>{instabilidade.instabilityReportedAt ? "Salvar alterações" : "Sinalizar instabilidade"}</Button></div>
      </form>}
    </Modal>

    <Modal open={!!detalhe} onClose={() => setDetalhe(null)} title="Detalhes do processamento" maxWidth="max-w-xl">
      {detalhe && <div className="mt-3 space-y-4 text-ui text-fg-secondary"><Selo tom={COR[detalhe.status]}>{ROTULOS_OPS[detalhe.status]}</Selo><p>{detalhe.watcherName} · {data(detalhe.processedAt)}</p><CampoForm label="Arquivo original" htmlFor="ops-detalhe-original"><Input id="ops-detalhe-original" readOnly value={detalhe.filename} /></CampoForm>{detalhe.filenameRenamed && <CampoForm label="Arquivo de destino" htmlFor="ops-detalhe-destino"><Input id="ops-detalhe-destino" readOnly value={detalhe.filenameRenamed} /></CampoForm>}<CampoForm label="Resultado" htmlFor="ops-detalhe-resultado"><Textarea id="ops-detalhe-resultado" readOnly rows={6} value={detalhe.errorMessage || "Nenhuma mensagem adicional informada pela automação."} /></CampoForm><Button variant="secondary" onClick={() => void copiar(caminhoDoEvento(detalhe, painel?.watchers.find(w => w.slug === detalhe.watcherSlug)), "Caminho copiado.")}><Copy size={14} /> Copiar caminho do arquivo</Button></div>}
    </Modal>
  </PageContainer>;
}
