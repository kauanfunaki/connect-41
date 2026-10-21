"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Campo, CamposDoChamado, nomeDaCategoria, type CategoriaDaTela } from "./CamposDoChamado";
import { FORMATOS } from "@/lib/chamados/formatos";
import { iniciar, guardar, avaliar, finalizar, retirarAnexo } from "@/app/(app)/chamados/actions";
import type { DadosDoChamado, Parecer } from "@/lib/chamados/regras";

type Anexo = { id: string; fileName: string; attachmentKey: string | null };
export type RascunhoDaTela = { id: string; version: number; dados: DadosDoChamado; parecer: Parecer | null; anexos: Anexo[]; mensagens: { id: string; role: string; body: string }[] };
export function NovoChamado({ inicial, categorias, setores }: { inicial: RascunhoDaTela | null; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[] }) {
  const router = useRouter(), formulario = useRef<HTMLFormElement>(null);
  const [dados, setDados] = useState<DadosDoChamado>(inicial?.dados ?? { title: "", description: "", categoryId: "", requesterSectorCode: setores.length === 1 ? setores[0].code : "", priority: "MEDIA", requestData: {}, tags: [] });
  const [etapaCategoria, setEtapaCategoria] = useState(!inicial?.dados.categoryId);
  const [draft, setDraft] = useState(inicial ? { id: inicial.id, version: inicial.version } : null);
  const [parecer, setParecer] = useState(inicial?.parecer ?? null), [anexos, setAnexos] = useState(inicial?.anexos ?? []);
  const [mensagens, setMensagens] = useState(inicial?.mensagens ?? []), [resposta, setResposta] = useState("");
  const [busy, setBusy] = useState(""), [erro, setErro] = useState(""), [aviso, setAviso] = useState("");
  const [chave, setChave] = useState(""); const abort = useRef<AbortController | null>(null);
  const cat = categorias.find(c => c.id === dados.categoryId);
  const mudou = useRef(false);
  function editar(novos: DadosDoChamado) { setDados(novos); setParecer(null); mudou.current = true; setAviso(""); }
  async function obterRascunho() {
    if (draft) return draft;
    const r = await iniciar(); if (!r.ok) throw new Error(r.error);
    setDraft(r.valor); window.history.replaceState(null, "", `/chamados/novo?rascunho=${r.valor.id}`); return r.valor;
  }
  async function salvar() {
    const atual = await obterRascunho();
    const r = await guardar(atual.id, atual.version, dados); if (!r.ok) throw new Error(r.error);
    const novo = { id: atual.id, version: r.valor.version }; setDraft(novo); mudou.current = false; return novo;
  }
  async function executar(nome: string, tarefa: () => Promise<void>) {
    setBusy(nome); setErro(""); setAviso("");
    try { await tarefa(); } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível concluir. Atualize a página se a conexão foi interrompida."); }
    finally { setBusy(""); }
  }
  function validarFormulario() {
    if (!dados.categoryId) {
      setErro("Selecione uma categoria para o chamado.");
      const seletor = document.getElementById("categoria-chamado");
      seletor?.scrollIntoView({ behavior: "smooth", block: "center" }); seletor?.focus();
      return false;
    }
    return formulario.current?.reportValidity() ?? false;
  }
  if (etapaCategoria) return <Card className="p-4 sm:p-6">
    <CamposDoChamado dados={dados} onChange={editar} categorias={categorias} setores={[]} somenteCategoria />
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button href="/chamados" variant="ghost">Cancelar</Button>
      <Button disabled={!dados.categoryId || !!busy} onClick={() => { setErro(""); setEtapaCategoria(false); }}>Próximo <span aria-hidden="true">→</span></Button>
    </div>
    {erro && <p role="alert" className="mt-3 text-ui text-danger">{erro}</p>}
  </Card>;
  async function enviar(revisar: boolean) {
    if (!validarFormulario()) return;
    await executar(revisar ? "Analisando informações…" : "Enviando chamado…", async () => {
      const d = mudou.current || !draft || !inicial ? await salvar() : draft;
      const r = revisar ? await avaliar(d.id, d.version) : await finalizar(d.id, d.version);
      if (!r.ok) throw new Error(r.error);
      if ("ticketId" in r.valor && r.valor.ticketId) { router.push(`/chamados/${r.valor.ticketId}`); return; }
      if ("parecer" in r.valor && r.valor.parecer) {
        const novoParecer = r.valor.parecer;
        setParecer(novoParecer); setMensagens(m => [...m, { id: crypto.randomUUID(), role: "assistant", body: [novoParecer.summary, ...novoParecer.questions].join("\n\n") }]);
      }
    });
  }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
    <form ref={formulario} onSubmit={e => { e.preventDefault(); void enviar(true); }} className="min-w-0 space-y-5">
      <Card className="p-5"><fieldset disabled={!!busy} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-heading font-semibold text-fg">Detalhes do chamado</h2><Button variant="ghost" size="sm" onClick={() => setEtapaCategoria(true)}>Alterar categoria{cat ? ` · ${nomeDaCategoria(categorias, cat.id)}` : ""}</Button></div>
        <CamposDoChamado dados={dados} onChange={editar} categorias={categorias} setores={setores} ocultarCategoria />
      </fieldset></Card>
      <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Anexos</h2>
        <p className="text-helper text-fg-secondary">Um arquivo por vez, até 10 MB. A análise considera até cinco arquivos e 20 MB, com prioridade para os obrigatórios.</p>
        {cat?.requiredAttachments.length ? <Campo label="Tipo de evidência"><Select disabled={!!busy} value={chave} onChange={e => setChave(e.target.value)}><option value="">Anexo complementar</option>{cat.requiredAttachments.map(a => <option key={a.key} value={a.key}>{a.label}{a.required ? " (obrigatório)" : ""}</option>)}</Select></Campo> : null}
        <label className="block text-ui text-fg-secondary">Adicionar arquivo<input aria-label="Adicionar arquivo" className="mt-2 block max-w-full text-ui" type="file" accept={FORMATOS} disabled={!!busy} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
          void executar("Enviando arquivo…", async () => {
            const d = await obterRascunho(), form = new FormData(); form.set("id", crypto.randomUUID()); form.set("draftId", d.id); form.set("version", String(d.version)); form.set("file", file); form.set("attachmentKey", chave);
            abort.current = new AbortController();
            const r = await fetch("/api/chamados/anexos", { method: "POST", body: form, signal: abort.current.signal });
            const resultado = await r.json(); if (!r.ok) throw new Error(resultado.error ?? "Falha no upload.");
            setDraft({ id: d.id, version: resultado.version }); setAnexos(a => [...a, { id: resultado.id, fileName: file.name, attachmentKey: chave || null }]); setParecer(null);
          });
        }} /></label>
        {anexos.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-ui"><a className="break-all text-brand hover:underline" href={`/api/chamados/anexos/${a.id}`} download>{a.fileName}</a><Button size="xs" variant="ghost" disabled={!!busy} onClick={() => void executar("Retirando anexo…", async () => {
          if (!draft) return; const r = await retirarAnexo(draft.id, a.id, draft.version); if (!r.ok) throw new Error(r.error); setDraft({ id: draft.id, version: r.valor.version }); setAnexos(anexos.filter(x => x.id !== a.id)); setParecer(null);
        })}>Retirar</Button></div>)}
        {cat?.requiredAttachments.filter(a => a.required && !anexos.some(x => x.attachmentKey === a.key)).map(a => <p key={a.key} className="text-helper text-warning">Falta anexar: {a.label}</p>)}
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!!busy || !categorias.length}>Enviar chamado</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => { if (validarFormulario()) void executar("Salvando rascunho…", async () => { await salvar(); setAviso("Rascunho salvo. Você pode retomar pela lista de chamados."); }); }}>Salvar rascunho</Button>
        <Button href="/chamados" variant="ghost">Voltar à lista</Button>
      </div>
      {busy && <p role="status" className="text-ui text-fg-secondary">{busy} {busy === "Enviando arquivo…" && <Button variant="link" onClick={() => abort.current?.abort()}>Parar envio</Button>}</p>}
      {erro && <p role="alert" className="text-ui text-danger">{erro} <Button variant="link" onClick={() => window.location.reload()}>Recarregar rascunho salvo</Button></p>}
      {aviso && <p role="status" className="text-ui text-success-fg">{aviso}</p>}
    </form>
    <Card className="min-w-0 self-start p-5 space-y-4">
      <h2 className="text-heading font-semibold text-fg">Revisão das informações</h2>
      <p className="text-ui text-fg-secondary">Ao enviar, a IA confere se há contexto suficiente para iniciar o atendimento. Você pode complementar aqui ou enviar mesmo assim.</p>
      <div role="log" aria-label="Conversa de revisão" aria-live="polite" className="max-h-[32rem] space-y-3 overflow-y-auto">
        {mensagens.map(m => <div key={m.id} className={`rounded-md p-3 text-ui whitespace-pre-wrap break-words ${m.role === "user" ? "bg-brand/8 text-fg" : "bg-surface-hover text-fg-secondary"}`}><p className="mb-1 text-helper font-semibold">{m.role === "user" ? "Você" : "Assistente"}</p>{m.body}</div>)}
        {!mensagens.length && <p className="text-helper text-fg-muted">A revisão aparecerá aqui depois do envio.</p>}
      </div>
      {parecer?.attachments.map(a => <p key={a.id} className="text-helper text-fg-secondary"><strong>{a.name}</strong>: {a.status === "analyzed" ? "Analisado" : a.status === "partial" ? "Análise parcial" : a.status === "unreadable" ? "Ilegível" : "Não analisado"}. {a.reason}</p>)}
      {parecer?.status === "needs_information" && <form onSubmit={e => {
        e.preventDefault(); if (!draft || !resposta.trim()) return;
        void executar("Analisando complemento…", async () => {
          const d = mudou.current ? await salvar() : draft; const texto = resposta;
          const r = await avaliar(d.id, d.version, texto); if (!r.ok) throw new Error(r.error);
          if (r.valor.ticketId) { router.push(`/chamados/${r.valor.ticketId}`); return; }
          setDraft({ id: d.id, version: r.valor.version }); setResposta("");
          if (r.valor.parecer) { setParecer(r.valor.parecer); setMensagens(m => [...m, { id: crypto.randomUUID(), role: "user", body: texto }, { id: crypto.randomUUID(), role: "assistant", body: [r.valor.parecer!.summary, ...r.valor.parecer!.questions].join("\n\n") }]); }
        });
      }} className="space-y-3"><Campo label="Complementar informações"><Textarea required rows={4} maxLength={10000} disabled={!!busy} value={resposta} onChange={e => setResposta(e.target.value)} /></Campo><Button type="submit" disabled={!!busy}>Responder ao assistente</Button></form>}
      {(parecer || mensagens.length > 0) && <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!!busy} onClick={() => void enviar(false)}>{parecer?.status === "unavailable" ? "Enviar sem análise" : "Enviar mesmo assim"}</Button>{parecer?.status === "unavailable" && <Button variant="ghost" disabled={!!busy} onClick={() => void enviar(true)}>Tentar análise novamente</Button>}</div>}
    </Card>
  </div>;
}
