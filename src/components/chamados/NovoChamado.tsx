"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, FileSpreadsheet, FileText, FileVideo, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Campo, CamposDoChamado, nomeDaCategoria, type CategoriaDaTela } from "./CamposDoChamado";
import { IconeDoArquivo } from "./LinhaDoTempo";
import { ConversaDaTriagem } from "./ConversaDaTriagem";
import { FORMATOS } from "@/lib/chamados/formatos";
import { formatInstantTime } from "@/lib/format";
import { mensagemDoExistente, perguntaAtual } from "@/lib/chamados/regras";
import { iniciar, guardar, avaliar, responderAoAssistente, finalizar, retirarAnexo, naoEOQuePreciso } from "@/app/(app)/chamados/actions";
import type { DadosDoChamado, Parecer } from "@/lib/chamados/regras";

type Anexo = { id: string; fileName: string; attachmentKey: string | null };
type Rascunho = { id: string; version: number };
export type RascunhoDaTela = { id: string; version: number; dados: DadosDoChamado; parecer: Parecer | null; anexos: Anexo[]; mensagens: { id: string; role: string; body: string }[] };
// Igual ao que o servidor grava: o resumo e só a primeira pergunta.
const mensagemDoParecer = (p: Parecer) => ({ id: crypto.randomUUID(), role: "assistant", body: p.existente ? mensagemDoExistente(p.existente) : [p.summary, ...p.questions.slice(0, 1).map(q => q.text)].join("\n\n") });
// Códigos do `busy` que pertencem ao modal da revisão; os demais aparecem no formulário.
const DO_MODAL = new Set(["analisando", "enviando", "respondendo"]);

export function NovoChamado({ inicial, categorias: categoriasIniciais, setores }: { inicial: RascunhoDaTela | null; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[] }) {
  const router = useRouter(), formulario = useRef<HTMLFormElement>(null), seletor = useRef<HTMLInputElement>(null);
  const [dados, setDados] = useState<DadosDoChamado>(inicial?.dados ?? { title: "", description: "", categoryId: "", requesterSectorCode: setores.length === 1 ? setores[0].code : "", priority: "MEDIA", requestData: {}, tags: [] });
  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [draft, setDraft] = useState<Rascunho | null>(inicial ? { id: inicial.id, version: inicial.version } : null);
  const [parecer, setParecer] = useState(inicial?.parecer ?? null), [anexos, setAnexos] = useState(inicial?.anexos ?? []);
  const [mensagens, setMensagens] = useState(inicial?.mensagens ?? []);
  // Volta à conversa se o rascunho foi deixado com uma pergunta em aberto.
  const [anexadosNaConversa, setAnexadosNaConversa] = useState<string[]>([]);
  const [revisao, setRevisao] = useState(() => !!perguntaAtual(inicial?.parecer ?? null, inicial?.mensagens ?? []));
  const [busy, setBusy] = useState(""), [erro, setErro] = useState(""), [salvoAs, setSalvoAs] = useState("");
  const [chave, setChave] = useState(""), [arrastando, setArrastando] = useState(false); const abort = useRef<AbortController | null>(null);
  const cat = categorias.find(c => c.id === dados.categoryId);
  const pergunta = perguntaAtual(parecer, mensagens), sugestao = parecer?.existente ?? null;
  const [aviso, setAviso] = useState("");
  // Salvamento automático (27/10/2026): sem "Salvar rascunho". Toda gravação
  // passa por uma fila, porque cada uma muda a versão do rascunho e a seguinte
  // precisa da nova; os refs dão à fila os valores atuais, não os do render.
  const draftRef = useRef(draft), dadosRef = useRef(dados), edicoes = useRef(0), salvas = useRef(0);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const podeSalvar = (d: DadosDoChamado) => !!d.description.trim() && !!d.requesterSectorCode;
  function definirRascunho(d: Rascunho) { draftRef.current = d; setDraft(d); }
  function emFila<T>(tarefa: () => Promise<T>) { const p = fila.current.then(tarefa, tarefa); fila.current = p.catch(() => undefined); return p; }
  function editar(novos: DadosDoChamado) {
    const reclassificar = novos.description !== dados.description || novos.requesterSectorCode !== dados.requesterSectorCode;
    const atual = { ...novos, categoryId: reclassificar ? "" : novos.categoryId, title: reclassificar ? "" : novos.title };
    dadosRef.current = atual; setDados(atual); setParecer(null); edicoes.current++;
  }
  async function obterRascunho() {
    if (draftRef.current) return draftRef.current;
    const r = await iniciar(); if (!r.ok) throw new Error(r.error);
    definirRascunho(r.valor); window.history.replaceState(null, "", `/chamados/novo?rascunho=${r.valor.id}`); return r.valor;
  }
  async function salvar() {
    const marca = edicoes.current, atual = await obterRascunho();
    const r = await guardar(atual.id, atual.version, dadosRef.current); if (!r.ok) throw new Error(r.error);
    const novo = { id: atual.id, version: r.valor.version }; definirRascunho(novo); salvas.current = marca;
    setSalvoAs(formatInstantTime(new Date(), { hour: "2-digit", minute: "2-digit" })); return novo;
  }
  const pendente = () => edicoes.current > salvas.current && podeSalvar(dadosRef.current);
  useEffect(() => {
    if (!pendente()) return;
    const t = setTimeout(() => { if (pendente()) void emFila(salvar).catch(() => undefined); }, 1000);
    return () => clearTimeout(t);
  }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps -- refs carregam o resto
  // Ao sair da tela, grava o que ainda não foi.
  useEffect(() => () => { if (pendente()) void emFila(salvar).catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function executar(nome: string, tarefa: () => Promise<void>) {
    setBusy(nome); setErro("");
    try { await emFila(tarefa); } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível concluir. Atualize a página se a conexão foi interrompida."); }
    finally { setBusy(""); }
  }
  async function rascunhoAtual() { return edicoes.current > salvas.current || !draftRef.current ? salvar() : draftRef.current; }
  async function enviar(revisar: boolean) {
    if (!(formulario.current?.reportValidity() ?? false)) return;
    setRevisao(true);
    // Pergunta em aberto e pedido sem edição (editar descarta o parecer): a
    // conversa continua de onde parou, sem nova análise.
    if (revisar && (pergunta || sugestao)) return;
    await executar(revisar ? "analisando" : "enviando", async () => {
      const d = await rascunhoAtual();
      const r = revisar ? await avaliar(d.id, d.version) : await finalizar(d.id, d.version);
      if (!r.ok) throw new Error(r.error);
      if ("ticketId" in r.valor && r.valor.ticketId) { router.push(`/chamados/${r.valor.ticketId}`); return; }
      if ("version" in r.valor) definirRascunho({ id: d.id, version: r.valor.version });
      if ("dados" in r.valor && r.valor.dados) { dadosRef.current = r.valor.dados; setDados(r.valor.dados); }
      if ("categorias" in r.valor && r.valor.categorias) setCategorias(r.valor.categorias);
      if ("parecer" in r.valor && r.valor.parecer) { const novo = r.valor.parecer; setParecer(novo); setMensagens(m => [...m, mensagemDoParecer(novo)]); }
    });
  }
  function responder(digitado: string) {
    // Só o arquivo, sem texto, também responde.
    const texto = digitado.trim() || (anexadosNaConversa.length ? `Anexei: ${anexadosNaConversa.join(", ")}` : "");
    if (!draft || !texto) return;
    // A última pergunta do parecer volta para a IA; as anteriores só avançam.
    // Um arquivo novo também volta: o servidor descartou o parecer ao recebê-lo.
    const final = !pergunta || pergunta.indice + 1 >= pergunta.total || anexadosNaConversa.length > 0;
    // O balão da pessoa entra na hora; sai de novo se a resposta não for registrada.
    const eu = { id: crypto.randomUUID(), role: "user", body: texto };
    setMensagens(m => [...m, eu]);
    void executar(final ? "analisando" : "respondendo", async () => {
      try {
        const d = await rascunhoAtual();
        const r = await responderAoAssistente(d.id, d.version, texto); if (!r.ok) throw new Error(r.error);
        const v = r.valor; setAnexadosNaConversa([]);
        if ("ticketId" in v && v.ticketId) { router.push(`/chamados/${v.ticketId}`); return; }
        definirRascunho({ id: d.id, version: v.version });
        if ("pergunta" in v) { setParecer(v.parecer); setMensagens(m => [...m, { id: crypto.randomUUID(), role: "assistant", body: v.pergunta }]); return; }
        if ("dados" in v && v.dados) { dadosRef.current = v.dados; setDados(v.dados); }
        if ("categorias" in v && v.categorias) setCategorias(v.categorias);
        if ("parecer" in v && v.parecer) { const novo = v.parecer; setParecer(novo); setMensagens(m => [...m, mensagemDoParecer(novo)]); }
      } catch (e) { setMensagens(m => m.filter(x => x.id !== eu.id)); throw e; }
    });
  }
  // "É isso" (28/10/2026): nada é enviado e o rascunho fica guardado, caso a
  // conversa com o responsável não resolva.
  function aceitarSugestao() {
    setRevisao(false);
    setAviso(sugestao?.responsavel ? `Rascunho guardado. Fale com ${sugestao.responsavel}; se não resolver, volte e envie o chamado.` : "Rascunho guardado. Se não resolver, volte e envie o chamado.");
  }
  function recusarSugestao() {
    if (!draft || !sugestao) return;
    const eu = { id: crypto.randomUUID(), role: "user", body: `Não é o que preciso: ${sugestao.nome}.` };
    setMensagens(m => [...m, eu]);
    void executar("respondendo", async () => {
      try {
        const d = await rascunhoAtual();
        const r = await naoEOQuePreciso(d.id, d.version); if (!r.ok) throw new Error(r.error);
        const v = r.valor;
        if ("ticketId" in v && v.ticketId) { router.push(`/chamados/${v.ticketId}`); return; }
        definirRascunho({ id: d.id, version: v.version });
        if ("parecer" in v && v.parecer) setParecer(v.parecer);
        const texto = "pergunta" in v ? v.pergunta : undefined;
        if (texto) setMensagens(m => [...m, { id: crypto.randomUUID(), role: "assistant", body: texto }]);
      } catch (e) { setMensagens(m => m.filter(x => x.id !== eu.id)); throw e; }
    });
  }
  // Na conversa (28/10/2026), o arquivo entra como complementar e a pergunta
  // continua na tela: ele segue para a IA junto com a próxima resposta.
  function subir(file: File, naConversa = false) {
    const tipo = naConversa ? "" : chave;
    void executar("Enviando arquivo…", async () => {
      const d = await obterRascunho(), form = new FormData(); form.set("id", crypto.randomUUID()); form.set("draftId", d.id); form.set("version", String(d.version)); form.set("file", file); form.set("attachmentKey", tipo);
      abort.current = new AbortController();
      const r = await fetch("/api/chamados/anexos", { method: "POST", body: form, signal: abort.current.signal });
      const resultado = await r.json(); if (!r.ok) throw new Error(resultado.error ?? "Falha no upload.");
      definirRascunho({ id: d.id, version: resultado.version }); setAnexos(a => [...a, { id: resultado.id, fileName: file.name, attachmentKey: tipo || null }]);
      if (!naConversa) { setParecer(null); return; }
      setAnexadosNaConversa(a => [...a, file.name]);
      setMensagens(m => [...m, { id: crypto.randomUUID(), role: "user", body: `📎 ${file.name}` }]);
    });
  }
  const doFormulario = busy && !DO_MODAL.has(busy) ? busy : "";
  return <>
    {/* Duas colunas (28/10/2026): o pedido à esquerda; anexos e envio num painel
        que acompanha a rolagem, para o botão ficar perto do que o fecha. */}
    <form ref={formulario} onSubmit={e => { e.preventDefault(); void enviar(true); }} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="min-w-0 p-5 sm:p-6"><fieldset disabled={!!busy} className="space-y-5">
        <h2 className="text-heading font-semibold text-fg">Detalhes do chamado</h2>
        <CamposDoChamado dados={dados} onChange={editar} categorias={categorias} setores={setores} ocultarCategoria ocultarTitulo ocultarTags abertura />
      </fieldset></Card>
      <Card className="min-w-0 divide-y divide-border xl:sticky xl:top-20">
        <section aria-labelledby="anexos-do-chamado" className="space-y-3 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="anexos-do-chamado" className="font-semibold text-fg">Anexos</h2>
            {!!anexos.length && <span className="text-helper text-fg-muted">{anexos.length} {anexos.length === 1 ? "arquivo" : "arquivos"}</span>}
          </div>
          {cat?.requiredAttachments.length ? <Campo label="Tipo de evidência"><Select disabled={!!busy} value={chave} onChange={e => setChave(e.target.value)}><option value="">Anexo complementar</option>{cat.requiredAttachments.map(a => <option key={a.key} value={a.key}>{a.label}{a.required ? " (obrigatório)" : ""}</option>)}</Select></Campo> : null}
          <div onDragOver={e => { e.preventDefault(); if (!busy) setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={e => { e.preventDefault(); setArrastando(false); const file = e.dataTransfer.files[0]; if (file && !busy) subir(file); }}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${arrastando ? "border-brand bg-brand/5" : "border-border-strong"}`}>
            <div aria-hidden className="flex items-center gap-2.5 text-fg-muted"><FileText size={18} /><FileImage size={18} /><FileSpreadsheet size={18} /><FileVideo size={18} /></div>
            <p className="text-ui text-fg-secondary">Arraste um arquivo para cá ou</p>
            <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => seletor.current?.click()}><Upload size={14} aria-hidden />Escolher arquivo</Button>
            <input ref={seletor} aria-label="Adicionar arquivo" type="file" accept={FORMATOS} hidden disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) subir(file); }} />
          </div>
          <p className="text-helper text-fg-muted">PDF, imagem, planilha, DOCX, TXT, ZIP ou vídeo, um por vez, até 10 MB. A análise considera até cinco arquivos e 20 MB, com prioridade para os obrigatórios.</p>
          {!!anexos.length && <ul aria-label="Arquivos anexados" className="space-y-1.5">{anexos.map(a => <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-surface-hover py-1.5 pl-2.5 pr-1 text-helper">
            <IconeDoArquivo nome={a.fileName} /><a className="min-w-0 flex-1 truncate text-fg hover:text-brand hover:underline" href={`/api/chamados/anexos/${a.id}`} download>{a.fileName}</a>
            <button type="button" disabled={!!busy} aria-label={`Retirar ${a.fileName}`} title="Retirar" onClick={() => void executar("Retirando anexo…", async () => {
              const d = draftRef.current; if (!d) return; const r = await retirarAnexo(d.id, a.id, d.version); if (!r.ok) throw new Error(r.error); definirRascunho({ id: d.id, version: r.valor.version }); setAnexos(lista => lista.filter(x => x.id !== a.id)); setParecer(null);
            })} className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><X size={12} /></button>
          </li>)}</ul>}
          {cat?.requiredAttachments.filter(a => a.required && !anexos.some(x => x.attachmentKey === a.key)).map(a => <p key={a.key} className="text-helper text-warning">Falta anexar: {a.label}</p>)}
        </section>
        <section aria-label="Envio" className="space-y-3 p-5">
          {cat ? <p className="text-ui text-fg-secondary" role="status">Classificação: <strong className="text-fg">{nomeDaCategoria(categorias, cat.id)}</strong>{dados.title && <><br />Título: <strong className="text-fg">{dados.title}</strong></>}</p>
            : <p className="text-ui text-fg-secondary">Ao enviar, a IA lê o pedido e, se faltar alguma informação, pergunta antes de abrir o chamado.</p>}
          <Button type="submit" size="lg" className="w-full" disabled={!!busy}>{pergunta || sugestao ? "Continuar revisão" : "Enviar chamado"}</Button>
          {aviso && sugestao ? <p className="text-center text-helper text-fg-secondary" role="status">{aviso}</p>
            : salvoAs && <p className="text-center text-helper text-fg-muted" role="status">Rascunho salvo às {salvoAs}</p>}
          {doFormulario && <p role="status" className="text-ui text-fg-secondary">{doFormulario} {doFormulario === "Enviando arquivo…" && <Button variant="link" onClick={() => abort.current?.abort()}>Parar envio</Button>}</p>}
          {erro && !revisao && <p role="alert" className="text-ui text-danger">{erro} <Button variant="link" onClick={() => window.location.reload()}>Recarregar rascunho salvo</Button></p>}
        </section>
      </Card>
    </form>
    <ConversaDaTriagem aberta={revisao} onFechar={() => { setRevisao(false); setErro(""); }} mensagens={mensagens} parecer={parecer} pergunta={pergunta} busy={busy} erro={erro}
      onResponder={responder} onAnexar={file => subir(file, true)} anexou={anexadosNaConversa.length > 0} onPararEnvio={() => abort.current?.abort()} onAceitarSugestao={aceitarSugestao} onRecusarSugestao={recusarSugestao} onEnviarMesmoAssim={() => void enviar(false)} onTentarNovamente={() => void enviar(true)} />
  </>;
}
