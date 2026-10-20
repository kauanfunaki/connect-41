"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Copy, FileText, FolderInput, FolderOutput, KeyRound, Pencil, Plus, RefreshCw, UserRound, XCircle } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatInstantDateTime } from "@/lib/format";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { MetricCard } from "@/components/ui/MetricCard";
import { useToast } from "@/components/ui/Toast";
import { atividade, caminhoDoEvento, ROTULOS_OPS } from "@/lib/ops/regras";
import type { EventoOps, PainelOps, WatcherOps } from "@/lib/ops/tipos";

const COR: Record<EventoOps["status"], TomDoSelo> = { SUCCESS: "sucesso", ERROR: "perigo", WARNING: "atencao" };
const data = (iso: string | null) => iso ? formatInstantDateTime(new Date(iso)) : "—";
const nomeArquivo = (p: string) => p.split(/[\\/]/).pop() || p;
const contar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
const emBranco = { slug: "", name: "", ownerId: "", description: "", client: "", folderInput: "", folderOutput: "", isActive: true };
type Formulario = typeof emBranco;
function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-ui text-fg-secondary"><span className="font-semibold">{titulo}</span>{children}</label>;
}
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
  const [pagina, setPagina] = useState(Math.max(1, Math.min(100000, Number.parseInt(params.get("page") ?? "1", 10) || 1))), [loading, setLoading] = useState(true), [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false), [erroAcao, setErroAcao] = useState("");
  const [edicao, setEdicao] = useState<WatcherOps | "novo" | null>(null), [form, setForm] = useState<Formulario>(emBranco);
  const [tokenPara, setTokenPara] = useState<WatcherOps | null>(null), [token, setToken] = useState("");
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
  useEffect(() => { window.history.replaceState(null, "", `/ops?${query}`); }, [query]);

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); toast.success("Copiado."); }
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
  const endpoint = (w: WatcherOps) => `/api/ops/watchers/${encodeURIComponent(w.slug)}`;
  const summary = painel?.summary;
  const totalPaginas = painel ? Math.max(1, Math.ceil(painel.total / painel.pageSize)) : 1;
  const paginaAtual = painel?.page ?? pagina;
  const atualizarCampo = (key: keyof Formulario, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  const botoesDePasta = (w: WatcherOps) => <div className="flex flex-wrap gap-2">
    {w.folderInput && <Button size="xs" variant="secondary" title={w.folderInput} onClick={() => void copiar(w.folderInput!)}><FolderInput size={14} /> Entrada</Button>}
    {w.folderOutput && <Button size="xs" variant="secondary" title={w.folderOutput} onClick={() => void copiar(w.folderOutput!)}><FolderOutput size={14} /> Saída</Button>}
  </div>;

  return <PageContainer>
    <PageHeader title="Ops Center" subtitle="Acompanhe as automações, os arquivos processados e o que precisa de atenção."
      action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void atualizar()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar</Button>{podeGerir && <Button onClick={() => editar("novo")}><Plus size={15} /> Nova automação</Button>}</div>}
      meta={<span>{painel ? `Atualizado em ${data(painel.serverTime)} · atualização a cada 30 segundos` : "Carregando o painel…"}</span>} />

    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Automações por responsável" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
        <Button size="sm" variant={!minhas ? "primary" : "ghost"} aria-pressed={!minhas} onClick={() => { setMinhas(false); setPagina(1); }}>Todas</Button>
        <Button size="sm" variant={minhas ? "primary" : "ghost"} aria-pressed={minhas} onClick={() => { setMinhas(true); setWatcher(""); setPagina(1); }}><UserRound size={14} /> Minhas automações</Button>
      </div>
      <span className="text-helper text-fg-secondary">{minhas ? "Somente as automações sob sua responsabilidade." : "Automações do setor e seus responsáveis."}</span>
    </div>

    {erro && <div role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/5 p-4 text-ui text-danger">{erro} {painel && "Os dados abaixo são da última atualização recebida."} <Button variant="link" onClick={() => void atualizar()}>Tentar novamente</Button></div>}
    {!painel && !erro && <Card className="p-8 text-center text-fg-secondary" role="status">Carregando automações e resultados…</Card>}
    {painel && <>
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Processados hoje" value={summary!.total} icon={<FileText size={16} />} />
        <MetricCard label="Sucessos" value={summary!.success} tom="ok" icon={<CheckCircle2 size={16} />} />
        <MetricCard label="Erros" value={summary!.error} tom={summary!.error ? "critico" : "neutro"} icon={<XCircle size={16} />} />
        <MetricCard label="Avisos" value={summary!.warning} tom={summary!.warning ? "atencao" : "neutro"} icon={<AlertTriangle size={16} />} />
        <MetricCard label="Taxa de sucesso" value={summary!.successRate === null ? "—" : `${Number(summary!.successRate).toLocaleString("pt-BR")}%`} detalhe="Dia atual · horário de Brasília" />
      </div>

      <section aria-labelledby="ops-automacoes" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3"><h2 id="ops-automacoes" className="text-section-title font-semibold text-fg">Automações</h2><span className="text-helper text-fg-secondary">{painel.watchers.length} cadastradas · {painel.watchers.filter(w => w.instabilityReportedAt).length} com instabilidade</span></div>
        {!painel.watchers.length ? <Card className="p-8 text-center"><Activity className="mx-auto mb-3 text-fg-muted" size={28} /><p className="font-semibold text-fg">{minhas ? "Nenhuma automação atribuída a você" : "Nenhuma automação cadastrada"}</p><p className="mt-2 text-ui text-fg-secondary">{minhas ? "O gestor pode definir o dono de cada automação no cadastro." : "Cadastre a automação e configure o envio de atividade e resultados para começar."}</p></Card> :
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{painel.watchers.map(w => {
            const sinal = atividade(w.lastHeartbeatAt, w.isActive, new Date(painel.serverTime).getTime());
            return <Card key={w.slug} className={`min-w-0 p-5 ${w.instabilityReportedAt ? "border-warning/50" : ""}`}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold text-fg">{w.name}</h3><p className="mt-1 break-words text-helper text-fg-secondary">{w.client || w.slug}</p></div><Activity size={19} className="shrink-0 text-brand" /></div>
              <div className="mt-3 flex flex-wrap gap-2"><Selo tom={sinal === "Em execução" ? "sucesso" : sinal === "Sem comunicação" ? "perigo" : "neutro"}>{sinal}</Selo>{w.instabilityReportedAt && <Selo tom="atencao">Instabilidade</Selo>}</div>
              <p className="mt-3 flex items-center gap-2 text-ui text-fg-secondary"><UserRound size={14} className="shrink-0" /><span className="break-words">{w.ownerName || "Sem responsável"}</span></p>
              {w.description && <p className="mt-2 break-words text-helper text-fg-secondary">{w.description}</p>}
              <p className="mt-3 text-helper text-fg-secondary">Hoje: <strong className="text-fg">{contar(w.totalToday, "processado", "processados")}</strong> · {contar(w.successToday, "sucesso", "sucessos")} · {contar(w.errorToday, "erro", "erros")}</p>
              <p className="mt-2 text-helper text-fg-muted">Último sinal: {data(w.lastHeartbeatAt)}</p>
              {w.lastEvent && <button className="mt-3 block w-full rounded-md bg-surface-2 p-3 text-left text-helper hover:bg-surface-hover" onClick={() => setDetalhe(w.lastEvent)}><span className="flex flex-wrap items-center gap-2"><Selo tom={COR[w.lastEvent.status]}>{ROTULOS_OPS[w.lastEvent.status]}</Selo><span className="text-fg-secondary">{data(w.lastEvent.processedAt)}</span></span><span className="mt-2 block truncate text-fg" title={w.lastEvent.filename}>{nomeArquivo(w.lastEvent.filenameRenamed || w.lastEvent.filename)}</span></button>}
              {w.instabilityReportedAt && <div className="mt-3 rounded-md bg-warning/8 p-3 text-helper text-warning-fg"><p className="whitespace-pre-wrap break-words">{w.instabilityNote}</p><p className="mt-2">{w.instabilityReportedByName} · {data(w.instabilityReportedAt)}</p>{w.instabilityTicketId && <Button variant="link" href={`/chamados/${encodeURIComponent(w.instabilityTicketId)}`} className="mt-2">Ver chamado</Button>}</div>}
              <div className="mt-4">{botoesDePasta(w)}</div>
              {podeGerir && <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Button size="xs" variant="ghost" onClick={() => editar(w)}><Pencil size={13} /> Editar</Button>
                <Button size="xs" variant="ghost" onClick={() => { setTokenPara(w); setToken(""); setErroAcao(""); }}><KeyRound size={13} /> Integração</Button>
                <Button size="xs" variant="ghost" onClick={() => { setInstabilidade(w); setNota(w.instabilityNote ?? ""); setChamado(w.instabilityTicketId ?? ""); setErroAcao(""); }}><AlertTriangle size={13} /> {w.instabilityReportedAt ? "Revisar instabilidade" : "Sinalizar instabilidade"}</Button>
              </div>}
            </Card>;
          })}</div>}
        <p className="mt-3 text-helper text-fg-muted">“Sem comunicação” indica ausência de sinal há pelo menos 3 minutos. Os caminhos podem ser copiados para abrir no Explorador de Arquivos.</p>
      </section>

      <section aria-labelledby="ops-historico"><h2 id="ops-historico" className="mb-3 text-section-title font-semibold text-fg">Histórico de processamento</h2>
        <Card>
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo titulo="Automação"><Select compact value={watcher} onChange={e => { setWatcher(e.target.value); setPagina(1); }}><option value="">Todas as automações</option>{painel.watchers.map(w => <option key={w.slug} value={w.slug}>{w.name}</option>)}</Select></Campo>
            <Campo titulo="Resultado"><Select compact value={status} onChange={e => { setStatus(e.target.value); setPagina(1); }}><option value="">Todos os resultados</option><option value="SUCCESS">Sucesso</option><option value="ERROR">Erro</option><option value="WARNING">Aviso</option></Select></Campo>
            <Campo titulo="Data do processamento"><CampoData compact value={dia} onChange={value => { setDia(value); setPagina(1); }} /></Campo>
            <div className="flex items-end"><Button variant="ghost" size="sm" onClick={() => { setWatcher(""); setStatus(""); setDia(""); setPagina(1); }}>Limpar filtros</Button></div>
          </div>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Eventos de processamento"><table className="w-full text-left text-ui">
            <thead className="border-b border-border bg-surface-2 text-helper text-fg-secondary"><tr>{["Data e hora", "Automação", "Arquivo", "Resultado", "Cliente", "Detalhes"].map(t => <th key={t} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{painel.events.map(e => <tr key={e.id} className="hover:bg-surface-hover"><td className="whitespace-nowrap px-4 py-3 text-fg-secondary">{data(e.processedAt)}</td><td className="px-4 py-3 text-fg">{e.watcherName}</td><td className="max-w-72 px-4 py-3"><button className="block max-w-full truncate text-brand hover:underline" title={caminhoDoEvento(e, painel.watchers.find(w => w.slug === e.watcherSlug))} onClick={() => void copiar(caminhoDoEvento(e, painel.watchers.find(w => w.slug === e.watcherSlug)))}>{nomeArquivo(e.filenameRenamed || e.filename)}</button></td><td className="px-4 py-3"><Selo tom={COR[e.status]}>{ROTULOS_OPS[e.status]}</Selo></td><td className="px-4 py-3 text-fg-secondary">{e.client || "—"}</td><td className="px-4 py-3"><Button variant="link" onClick={() => setDetalhe(e)}>Ver detalhes</Button></td></tr>)}</tbody>
          </table></div>
          {!painel.events.length && <p className="p-8 text-center text-ui text-fg-secondary">Nenhum evento encontrado para este recorte.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-helper text-fg-secondary"><span>{painel.total} eventos · página {paginaAtual} de {totalPaginas}</span><div className="flex gap-2"><Button size="sm" variant="secondary" aria-label="Página anterior" disabled={loading || paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}><ChevronLeft size={15} /> Anterior</Button><Button size="sm" variant="secondary" aria-label="Próxima página" disabled={loading || paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima <ChevronRight size={15} /></Button></div></div>
        </Card>
      </section>
    </>}

    <Modal open={!!edicao} onClose={() => { if (!ocupado) setEdicao(null); }} title={edicao === "novo" ? "Nova automação" : "Editar automação"} maxWidth="max-w-xl">
      <form className="mt-3 space-y-4" onSubmit={e => { e.preventDefault(); void agir(async () => {
        await gravar(edicao === "novo" ? "/api/ops/watchers" : endpoint(edicao!), edicao === "novo" ? "POST" : "PATCH", { ...form, ...(edicao !== "novo" && edicao ? { version: edicao.version } : {}) });
        setEdicao(null); toast.success("Automação salva.");
      }); }}>
        <div className="grid gap-4 sm:grid-cols-2"><Campo titulo="Nome"><Input required maxLength={120} value={form.name} onChange={e => atualizarCampo("name", e.target.value)} /></Campo><Campo titulo="Identificador"><Input required maxLength={60} pattern="[a-z0-9]+([-_][a-z0-9]+)*" disabled={edicao !== "novo"} value={form.slug} placeholder="ex.: dominio_xls_to_txt" onChange={e => atualizarCampo("slug", e.target.value)} /></Campo></div>
        <Campo titulo="Dono da automação"><Select value={form.ownerId} onChange={e => atualizarCampo("ownerId", e.target.value)}><option value="">Sem responsável</option>{form.ownerId && !painel?.owners.some(u => u.id === form.ownerId) && <option value={form.ownerId}>Responsável indisponível — selecione outro</option>}{painel?.owners.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Campo>
        <p className="text-helper text-fg-secondary">O responsável recebe uma notificação no Connect quando a automação registra um erro.</p>
        <Campo titulo="Cliente ou grupo"><Input maxLength={120} value={form.client} onChange={e => atualizarCampo("client", e.target.value)} /></Campo>
        <Campo titulo="Descrição"><Textarea maxLength={1000} value={form.description} onChange={e => atualizarCampo("description", e.target.value)} /></Campo>
        <Campo titulo="Pasta de entrada"><Input maxLength={1000} value={form.folderInput} onChange={e => atualizarCampo("folderInput", e.target.value)} /></Campo>
        <Campo titulo="Pasta de saída"><Input maxLength={1000} value={form.folderOutput} onChange={e => atualizarCampo("folderOutput", e.target.value)} /></Campo>
        <Checkbox label="Recebimento ativo" checked={form.isActive} onChange={e => atualizarCampo("isActive", e.target.checked)} />
        {!form.isActive && <p className="text-helper text-warning-fg">Ao desativar, a chave atual será revogada. O histórico permanece disponível.</p>}
        {erroAcao && <p role="alert" className="text-ui text-danger">{erroAcao}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={ocupado} onClick={() => setEdicao(null)}>Cancelar</Button><Button type="submit" loading={ocupado}>Salvar automação</Button></div>
      </form>
    </Modal>

    <Modal open={!!tokenPara} onClose={() => { if (!ocupado) { setTokenPara(null); setToken(""); } }} title="Integração da automação" maxWidth="max-w-xl">
      {tokenPara && <div className="mt-3 space-y-4 text-ui text-fg-secondary"><p className="font-semibold text-fg">{tokenPara.name}</p><p>Gere uma chave para o bot enviar seus resultados. Ao gerar outra chave, a anterior para de funcionar. A chave nova aparece apenas nesta janela.</p>
        <p className="break-all rounded-md bg-surface-2 p-3 font-mono text-helper">POST /api/ops/events<br />POST {endpoint(tokenPara)}/heartbeat</p>
        <p>Envie a atividade a cada 30 segundos e um evento por tentativa de processamento. Guarde a chave na configuração protegida do bot.</p>
        {token && <Campo titulo="Chave gerada"><Input readOnly value={token} onFocus={e => e.target.select()} /><Button variant="secondary" type="button" onClick={() => void copiar(token)}><Copy size={14} /> Copiar chave</Button></Campo>}
        {!tokenPara.isActive && <p className="text-warning-fg">Ative o recebimento no cadastro antes de gerar a chave.</p>}
        {erroAcao && <p role="alert" className="text-danger">{erroAcao}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={ocupado} onClick={() => { setTokenPara(null); setToken(""); }}>Fechar</Button>
          {tokenPara.hasToken && !token && <Button variant="danger" disabled={ocupado} onClick={() => void agir(async () => { await gravar(`${endpoint(tokenPara)}/token`, "DELETE", { version: tokenPara.version }); setTokenPara(null); toast.success("Chave revogada."); })}>Revogar chave</Button>}
          {!token && <Button disabled={ocupado || !tokenPara.isActive} onClick={() => void agir(async () => { const r = await gravar(`${endpoint(tokenPara)}/token`, "POST", { version: tokenPara.version }); setToken(r.token ?? ""); })}>Gerar chave</Button>}
        </div>
      </div>}
    </Modal>

    <Modal open={!!instabilidade} onClose={() => { if (!ocupado) setInstabilidade(null); }} title="Instabilidade da automação" maxWidth="max-w-xl">
      {instabilidade && <form className="mt-3 space-y-4" onSubmit={e => { e.preventDefault(); void agir(async () => {
        await gravar(`${endpoint(instabilidade)}/instability`, "POST", { version: instabilidade.version, note: nota, ticketId: chamado });
        setInstabilidade(null); toast.success("Instabilidade sinalizada.");
      }); }}><p className="font-semibold text-fg">{instabilidade.name}</p><Campo titulo="O que aconteceu?"><Textarea required minLength={3} maxLength={2000} value={nota} onChange={e => setNota(e.target.value)} /></Campo><Campo titulo="ID do chamado (opcional)"><Input maxLength={191} value={chamado} onChange={e => setChamado(e.target.value)} placeholder="ID do chamado já aberto no Connect" /></Campo><p className="text-helper text-fg-secondary">Você pode <Button variant="link" href="/chamados/novo" target="_blank" rel="noopener noreferrer">abrir um chamado</Button> e vincular o ID aqui.</p>
        {erroAcao && <p role="alert" className="text-ui text-danger">{erroAcao}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" type="button" disabled={ocupado} onClick={() => setInstabilidade(null)}>Cancelar</Button>{instabilidade.instabilityReportedAt && <Button type="button" variant="success" disabled={ocupado} onClick={() => void agir(async () => { await gravar(`${endpoint(instabilidade)}/instability`, "DELETE", { version: instabilidade.version }); setInstabilidade(null); toast.success("Sinalização de instabilidade resolvida."); })}>Marcar como resolvida</Button>}<Button type="submit" loading={ocupado}>Sinalizar instabilidade</Button></div>
      </form>}
    </Modal>

    <Modal open={!!detalhe} onClose={() => setDetalhe(null)} title="Detalhes do processamento" maxWidth="max-w-xl">
      {detalhe && <div className="mt-3 space-y-4 text-ui text-fg-secondary"><Selo tom={COR[detalhe.status]}>{ROTULOS_OPS[detalhe.status]}</Selo><p>{detalhe.watcherName} · {data(detalhe.processedAt)}</p><Campo titulo="Arquivo original"><Input readOnly value={detalhe.filename} /></Campo>{detalhe.filenameRenamed && <Campo titulo="Arquivo de destino"><Input readOnly value={detalhe.filenameRenamed} /></Campo>}<Campo titulo="Resultado"><Textarea readOnly rows={6} value={detalhe.errorMessage || "Nenhuma mensagem adicional informada pela automação."} /></Campo><Button variant="secondary" onClick={() => void copiar(caminhoDoEvento(detalhe, painel?.watchers.find(w => w.slug === detalhe.watcherSlug)))}><Copy size={14} /> Copiar caminho do arquivo</Button></div>}
    </Modal>
  </PageContainer>;
}
