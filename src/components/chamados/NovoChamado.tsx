"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileImage, FileSpreadsheet, FileText, FileVideo, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Stepper, type StepStatus } from "@/components/ui/Stepper";
import { Campo, CamposDoChamado, type CategoriaDaTela } from "./CamposDoChamado";
import { IconeDoArquivo } from "./LinhaDoTempo";
import { CarregandoIA, ConversaDaTriagem } from "./ConversaDaTriagem";
import { FORMATOS } from "@/lib/chamados/formatos";
import { formatInstantTime } from "@/lib/format";
import { mensagemDoExistente, perguntaAtual } from "@/lib/chamados/regras";
import { iniciar, guardar, avaliar, responderAoAssistente, retirarAnexo, naoEOQuePreciso, abrirChamado } from "@/app/(app)/chamados/actions";
import type { DadosDoChamado, Parecer } from "@/lib/chamados/regras";

// Novo chamado em três etapas (28/10/2026), com a barra de progresso do
// cadastro de empresa: 1. o pedido; 2. a conversa com a IA, só quando ela tem
// algo a perguntar ou a apontar no Ops Center; 3. a revisão, com todos os campos
// preenchidos e editáveis, inclusive os anexos que a IA escolheu manter.

type Anexo = { id: string; fileName: string; attachmentKey: string | null };
type Rascunho = { id: string; version: number };
type Etapa = 1 | 2 | 3;
export type RascunhoDaTela = { id: string; version: number; dados: DadosDoChamado; parecer: Parecer | null; anexos: Anexo[]; mensagens: { id: string; role: string; body: string }[] };
const ETAPAS = ["Pedido", "Conversa com a IA", "Revisão"];
// Igual ao que o servidor grava: o resumo e só a primeira pergunta.
const mensagemDoParecer = (p: Parecer) => ({ id: crypto.randomUUID(), role: "assistant", body: p.existente ? mensagemDoExistente(p.existente) : [p.summary, ...p.questions.slice(0, 1).map(q => q.text)].join("\n\n") });
// Códigos do `busy` com tela própria (modal de carregamento ou conversa); os demais aparecem como texto.
const SEM_TEXTO = new Set(["analisando", "enviando", "respondendo"]);
const prontoParaRevisao = (p: Parecer | null) => p?.status === "sufficient" && !p.existente;

export function NovoChamado({ inicial, categorias: categoriasIniciais, setores }: { inicial: RascunhoDaTela | null; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[] }) {
  const router = useRouter(), formulario = useRef<HTMLFormElement>(null);
  const [dados, setDados] = useState<DadosDoChamado>(inicial?.dados ?? { title: "", description: "", categoryId: "", requesterSectorCode: setores.length === 1 ? setores[0].code : "", priority: "MEDIA", requestData: {}, tags: [] });
  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [draft, setDraft] = useState<Rascunho | null>(inicial ? { id: inicial.id, version: inicial.version } : null);
  const [parecer, setParecer] = useState(inicial?.parecer ?? null), [anexos, setAnexos] = useState(inicial?.anexos ?? []);
  const [mensagens, setMensagens] = useState(inicial?.mensagens ?? []);
  const [anexadosNaConversa, setAnexadosNaConversa] = useState<string[]>([]);
  const [busy, setBusy] = useState(""), [erro, setErro] = useState(""), [salvoAs, setSalvoAs] = useState("");
  const [chave, setChave] = useState(""); const abort = useRef<AbortController | null>(null);
  const [aviso, setAviso] = useState("");
  const pergunta = perguntaAtual(parecer, mensagens), sugestao = parecer?.existente ?? null;
  // A revisão (etapa 3) edita uma cópia: o que a pessoa muda ali não volta a
  // classificar nem descarta o parecer, e só vai ao servidor ao abrir o chamado.
  const [final, setFinal] = useState<DadosDoChamado>(() => montarFinal(inicial?.dados ?? dados, inicial?.parecer ?? null));
  const [incluidos, setIncluidos] = useState<string[]>(() => inicial?.parecer?.final?.anexos ?? inicial?.anexos.map(a => a.id) ?? []);
  // Abre onde o rascunho parou.
  const [etapa, setEtapa] = useState<Etapa>(() => prontoParaRevisao(inicial?.parecer ?? null) ? 3 : inicial?.parecer && inicial.mensagens.length ? 2 : 1);
  const cat = categorias.find(c => c.id === dados.categoryId);
  // Salvamento automático do pedido (27/10/2026). Toda gravação passa por uma
  // fila, porque cada uma muda a versão do rascunho e a seguinte precisa da
  // nova; os refs dão à fila os valores atuais, não os do render.
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

  function irParaRevisao(base = dadosRef.current, p = parecer) {
    setFinal(montarFinal(base, p));
    setIncluidos(p?.final?.anexos ?? anexos.map(a => a.id));
    setEtapa(3); window.scrollTo({ top: 0 });
  }
  /** Depois de cada análise: suficiente vai à revisão; pergunta ou sugestão do Ops Center, à conversa. */
  function seguir(novo: Parecer, base: DadosDoChamado) {
    if (prontoParaRevisao(novo)) irParaRevisao(base, novo);
    else { setEtapa(2); window.scrollTo({ top: 0 }); }
  }
  function continuar() {
    if (!(formulario.current?.reportValidity() ?? false)) return;
    // Pedido sem edição desde a última análise: retoma de onde parou.
    if (parecer) { if (prontoParaRevisao(parecer)) irParaRevisao(); else setEtapa(2); return; }
    void executar("analisando", async () => {
      const d = await rascunhoAtual();
      const r = await avaliar(d.id, d.version); if (!r.ok) throw new Error(r.error);
      const v = r.valor;
      if ("ticketId" in v && v.ticketId) { router.push(`/chamados/${v.ticketId}`); return; }
      if ("version" in v) definirRascunho({ id: d.id, version: v.version });
      let base = dadosRef.current;
      if ("dados" in v && v.dados) { base = v.dados; dadosRef.current = v.dados; setDados(v.dados); }
      if ("categorias" in v && v.categorias) setCategorias(v.categorias);
      if ("parecer" in v && v.parecer) { const novo = v.parecer; setParecer(novo); setMensagens(m => [...m, mensagemDoParecer(novo)]); seguir(novo, base); }
    });
  }
  function responder(digitado: string) {
    // Só o arquivo, sem texto, também responde.
    const texto = digitado.trim() || (anexadosNaConversa.length ? `Anexei: ${anexadosNaConversa.join(", ")}` : "");
    if (!draft || !texto) return;
    // A última pergunta do parecer volta para a IA; as anteriores só avançam.
    // Um arquivo novo também volta: o servidor descartou o parecer ao recebê-lo.
    const ultima = !pergunta || pergunta.indice + 1 >= pergunta.total || anexadosNaConversa.length > 0;
    // O balão da pessoa entra na hora; sai de novo se a resposta não for registrada.
    const eu = { id: crypto.randomUUID(), role: "user", body: texto };
    setMensagens(m => [...m, eu]);
    void executar(ultima ? "analisando" : "respondendo", async () => {
      try {
        const d = await rascunhoAtual();
        const r = await responderAoAssistente(d.id, d.version, texto); if (!r.ok) throw new Error(r.error);
        const v = r.valor; setAnexadosNaConversa([]);
        if ("ticketId" in v && v.ticketId) { router.push(`/chamados/${v.ticketId}`); return; }
        definirRascunho({ id: d.id, version: v.version });
        if ("pergunta" in v) { setParecer(v.parecer); setMensagens(m => [...m, { id: crypto.randomUUID(), role: "assistant", body: v.pergunta }]); return; }
        let base = dadosRef.current;
        if ("dados" in v && v.dados) { base = v.dados; dadosRef.current = v.dados; setDados(v.dados); }
        if ("categorias" in v && v.categorias) setCategorias(v.categorias);
        if ("parecer" in v && v.parecer) { const novo = v.parecer; setParecer(novo); setMensagens(m => [...m, mensagemDoParecer(novo)]); seguir(novo, base); }
      } catch (e) { setMensagens(m => m.filter(x => x.id !== eu.id)); throw e; }
    });
  }
  // "É isso" (28/10/2026): nada é enviado e o rascunho fica guardado, caso a
  // conversa com o responsável não resolva.
  function aceitarSugestao() {
    setAviso(sugestao?.responsavel ? `Rascunho guardado. Fale com ${sugestao.responsavel}; se não resolver, volte aqui e siga com o chamado.` : "Rascunho guardado. Se não resolver, volte aqui e siga com o chamado.");
  }
  function recusarSugestao() {
    if (!draft || !sugestao) return;
    const eu = { id: crypto.randomUUID(), role: "user", body: `Não é o que preciso: ${sugestao.nome}.` };
    setMensagens(m => [...m, eu]); setAviso("");
    void executar("respondendo", async () => {
      try {
        const d = await rascunhoAtual();
        const r = await naoEOQuePreciso(d.id, d.version); if (!r.ok) throw new Error(r.error);
        const v = r.valor;
        definirRascunho({ id: d.id, version: v.version });
        setParecer(v.parecer);
        const texto = v.pergunta;
        if (texto) setMensagens(m => [...m, { id: crypto.randomUUID(), role: "assistant", body: texto }]);
        else seguir(v.parecer, dadosRef.current);
      } catch (e) { setMensagens(m => m.filter(x => x.id !== eu.id)); throw e; }
    });
  }
  // O arquivo do pedido descarta o parecer (a IA precisa ler de novo); o da
  // conversa segue com a próxima resposta; o da revisão já entra marcado.
  function subir(file: File, onde: "pedido" | "conversa" | "revisao" = "pedido") {
    const tipo = onde === "conversa" ? "" : chave;
    void executar("Enviando arquivo…", async () => {
      const d = await obterRascunho(), form = new FormData(); form.set("id", crypto.randomUUID()); form.set("draftId", d.id); form.set("version", String(d.version)); form.set("file", file); form.set("attachmentKey", tipo);
      abort.current = new AbortController();
      const r = await fetch("/api/chamados/anexos", { method: "POST", body: form, signal: abort.current.signal });
      const resultado = await r.json(); if (!r.ok) throw new Error(resultado.error ?? "Falha no upload.");
      definirRascunho({ id: d.id, version: resultado.version }); setAnexos(a => [...a, { id: resultado.id, fileName: file.name, attachmentKey: tipo || null }]);
      if (onde === "pedido") { setParecer(null); return; }
      if (onde === "revisao") { setIncluidos(i => [...i, resultado.id]); return; }
      setAnexadosNaConversa(a => [...a, file.name]);
      setMensagens(m => [...m, { id: crypto.randomUUID(), role: "user", body: `📎 ${file.name}` }]);
    });
  }
  function retirar(a: Anexo) {
    void executar("Retirando anexo…", async () => {
      const d = draftRef.current; if (!d) return;
      const r = await retirarAnexo(d.id, a.id, d.version); if (!r.ok) throw new Error(r.error);
      definirRascunho({ id: d.id, version: r.valor.version }); setAnexos(lista => lista.filter(x => x.id !== a.id)); setParecer(null);
    });
  }
  function enviarRevisao() {
    if (!(formulario.current?.reportValidity() ?? false)) return;
    void executar("enviando", async () => {
      const d = await rascunhoAtual();
      const r = await abrirChamado(d.id, d.version, { dados: final, retirar: anexos.filter(a => !incluidos.includes(a.id)).map(a => a.id) });
      if (!r.ok) throw new Error(r.error);
      router.push(`/chamados/${r.valor.ticketId}`);
    });
  }

  const conversou = mensagens.length > 0;
  const steps = ETAPAS.map((label, i): { label: string; status: StepStatus; disabled?: boolean } => ({
    label, status: i + 1 === etapa ? "current" : i + 1 < etapa ? "done" : "upcoming",
    // A conversa só se abre de volta se houve conversa.
    disabled: i + 1 > etapa || (i === 1 && !conversou),
  }));
  const textoDeBusy = busy && !SEM_TEXTO.has(busy) ? busy : "";
  const statusDeBusy = textoDeBusy && <p role="status" className="text-ui text-fg-secondary">{textoDeBusy} {textoDeBusy === "Enviando arquivo…" && <Button variant="link" onClick={() => abort.current?.abort()}>Parar envio</Button>}</p>;
  const catFinal = categorias.find(c => c.id === final.categoryId);

  return <>
    <div className="mb-5 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--c41-shadow-xs)] [&>ol]:border-b-0">
      <Stepper steps={steps} onStepClick={i => { const alvo = (i + 1) as Etapa; if (alvo < etapa && (alvo !== 2 || conversou)) { setErro(""); setEtapa(alvo); } }} />
    </div>
    <CarregandoIA aberto={busy === "analisando" || busy === "enviando"} subtitulo={busy === "enviando" ? "Abrindo o chamado" : "Processando as informações do chamado"} />

    {etapa === 1 && <form ref={formulario} onSubmit={e => { e.preventDefault(); continuar(); }} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="min-w-0 p-5 sm:p-6"><fieldset disabled={!!busy} className="space-y-5">
        <h2 className="text-heading font-semibold text-fg">Detalhes do chamado</h2>
        <CamposDoChamado dados={dados} onChange={editar} categorias={categorias} setores={setores} ocultarCategoria ocultarTitulo ocultarTags abertura />
      </fieldset></Card>
      <Card className="min-w-0 divide-y divide-border xl:sticky xl:top-20">
        <PainelDeAnexos anexos={anexos} busy={busy} chave={chave} onChave={setChave} requisitos={cat?.requiredAttachments ?? []} onSubir={f => subir(f)} onRetirar={retirar} />
        <section aria-label="Continuar" className="space-y-3 p-5">
          <p className="text-ui text-fg-secondary">Ao continuar, a IA lê o pedido, pergunta o que faltar e monta o chamado para você revisar.</p>
          <Button type="submit" size="lg" className="w-full" disabled={!!busy}>Continuar</Button>
          {salvoAs && <p className="text-center text-helper text-fg-muted" role="status">Rascunho salvo às {salvoAs}</p>}
          {statusDeBusy}
          {erro && <p role="alert" className="text-ui text-danger">{erro} <Button variant="link" onClick={() => window.location.reload()}>Recarregar rascunho salvo</Button></p>}
        </section>
      </Card>
    </form>}

    {etapa === 2 && <ConversaDaTriagem mensagens={mensagens} parecer={parecer} pergunta={pergunta} busy={busy} erro={erro} aviso={aviso}
      onResponder={responder} onAnexar={f => subir(f, "conversa")} anexou={anexadosNaConversa.length > 0} onPararEnvio={() => abort.current?.abort()}
      onAceitarSugestao={aceitarSugestao} onRecusarSugestao={recusarSugestao}
      onVoltar={() => { setErro(""); setEtapa(1); }} onIrParaRevisao={() => irParaRevisao()} onTentarNovamente={() => { setParecer(null); setEtapa(1); }} />}

    {etapa === 3 && <form ref={formulario} onSubmit={e => { e.preventDefault(); enviarRevisao(); }} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="min-w-0 p-5 sm:p-6"><fieldset disabled={!!busy} className="space-y-5">
        <div>
          <h2 className="text-heading font-semibold text-fg">Revisão do chamado</h2>
          <p className="mt-1 text-ui text-fg-secondary">{parecer?.status === "unavailable" ? "A IA não conseguiu montar o chamado agora. Confira e complete os campos antes de abrir." : "A IA preencheu tudo com o pedido e a conversa. Confira e mude o que precisar."}</p>
        </div>
        <CamposDoChamado dados={final} onChange={setFinal} categorias={categorias} setores={setores} />
      </fieldset></Card>
      <Card className="min-w-0 divide-y divide-border xl:sticky xl:top-20">
        <PainelDeAnexos anexos={anexos} busy={busy} chave={chave} onChave={setChave} requisitos={catFinal?.requiredAttachments ?? []} onSubir={f => subir(f, "revisao")}
          escolha={{ incluidos, sugeridos: parecer?.final?.anexos ?? null, alternar: id => setIncluidos(i => i.includes(id) ? i.filter(x => x !== id) : [...i, id]) }} />
        <section aria-label="Abrir chamado" className="space-y-3 p-5">
          <Button type="submit" size="lg" className="w-full" disabled={!!busy}>Abrir chamado</Button>
          <Button variant="ghost" className="w-full" disabled={!!busy} onClick={() => { setErro(""); setEtapa(conversou ? 2 : 1); }}><ArrowLeft size={14} /> {conversou ? "Voltar à conversa" : "Voltar ao pedido"}</Button>
          {statusDeBusy}
          {erro && <p role="alert" className="text-ui text-danger">{erro}</p>}
        </section>
      </Card>
    </form>}
  </>;
}

/** O ponto de partida da revisão: o pedido com a classificação, e a descrição que a IA montou. */
function montarFinal(base: DadosDoChamado, p: Parecer | null): DadosDoChamado {
  return { ...base, description: p?.final?.description ?? base.description };
}

type Requisito = { key: string; label: string; required: boolean };
function PainelDeAnexos({ anexos, busy, chave, onChave, requisitos, onSubir, onRetirar, escolha }: {
  anexos: Anexo[]; busy: string; chave: string; onChave: (c: string) => void; requisitos: Requisito[]; onSubir: (f: File) => void;
  /** No pedido, o X retira o arquivo do rascunho. */ onRetirar?: (a: Anexo) => void;
  /** Na revisão, cada arquivo tem a caixa "segue no chamado", começando pela escolha da IA. */
  escolha?: { incluidos: string[]; sugeridos: string[] | null; alternar: (id: string) => void };
}) {
  const seletor = useRef<HTMLInputElement>(null), [arrastando, setArrastando] = useState(false);
  const seguem = escolha ? anexos.filter(a => escolha.incluidos.includes(a.id)) : anexos;
  return <section aria-labelledby="anexos-do-chamado" className="space-y-3 p-5">
    <div className="flex items-baseline justify-between gap-2">
      <h2 id="anexos-do-chamado" className="font-semibold text-fg">Anexos</h2>
      {!!anexos.length && <span className="text-helper text-fg-muted">{escolha ? `${seguem.length} de ${anexos.length} seguem` : `${anexos.length} ${anexos.length === 1 ? "arquivo" : "arquivos"}`}</span>}
    </div>
    {escolha && !!anexos.length && <p className="text-helper text-fg-secondary">{escolha.sugeridos ? "A IA marcou os arquivos que ajudam no atendimento. Os desmarcados saem do chamado." : "Desmarque os arquivos que não devem ir para o chamado."}</p>}
    {requisitos.length ? <Campo label="Tipo de evidência"><Select disabled={!!busy} value={chave} onChange={e => onChave(e.target.value)}><option value="">Anexo complementar</option>{requisitos.map(a => <option key={a.key} value={a.key}>{a.label}{a.required ? " (obrigatório)" : ""}</option>)}</Select></Campo> : null}
    <div onDragOver={e => { e.preventDefault(); if (!busy) setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={e => { e.preventDefault(); setArrastando(false); const file = e.dataTransfer.files[0]; if (file && !busy) onSubir(file); }}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${arrastando ? "border-brand bg-brand/5" : "border-border-strong"}`}>
      <div aria-hidden className="flex items-center gap-2.5 text-fg-muted"><FileText size={18} /><FileImage size={18} /><FileSpreadsheet size={18} /><FileVideo size={18} /></div>
      <p className="text-ui text-fg-secondary">Arraste um arquivo para cá ou</p>
      <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => seletor.current?.click()}><Upload size={14} aria-hidden />Escolher arquivo</Button>
      <input ref={seletor} aria-label="Adicionar arquivo" type="file" accept={FORMATOS} hidden disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onSubir(file); }} />
    </div>
    <p className="text-helper text-fg-muted">PDF, imagem, planilha, DOCX, TXT, ZIP ou vídeo, um por vez, até 10 MB. A análise considera até cinco arquivos e 20 MB, com prioridade para os obrigatórios.</p>
    {!!anexos.length && <ul aria-label="Arquivos anexados" className="space-y-1.5">{anexos.map(a => {
      const segue = !escolha || escolha.incluidos.includes(a.id), deFora = escolha?.sugeridos && !escolha.sugeridos.includes(a.id);
      return <li key={a.id} className={`flex items-center gap-2 rounded-md border border-border py-1.5 pl-2.5 pr-1 text-helper ${segue ? "bg-surface-hover" : "bg-surface opacity-70"}`}>
        {escolha && <Checkbox aria-label={`${a.fileName} segue no chamado`} checked={segue} disabled={!!busy} onChange={() => escolha.alternar(a.id)} />}
        <IconeDoArquivo nome={a.fileName} />
        <span className="min-w-0 flex-1"><a className="block truncate text-fg hover:text-brand hover:underline" href={`/api/chamados/anexos/${a.id}`} download>{a.fileName}</a>
          {deFora && <span className="block text-fg-muted">A IA deixou de fora</span>}</span>
        {onRetirar && <button type="button" disabled={!!busy} aria-label={`Retirar ${a.fileName}`} title="Retirar" onClick={() => onRetirar(a)} className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><X size={12} /></button>}
      </li>;
    })}</ul>}
    {requisitos.filter(r => r.required && !seguem.some(x => x.attachmentKey === r.key)).map(r => <p key={r.key} className="text-helper text-warning">Falta anexar: {r.label}</p>)}
  </section>;
}
