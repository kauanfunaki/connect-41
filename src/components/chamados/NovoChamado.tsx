"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileImage, FileSpreadsheet, FileText, FileVideo, ScanSearch, Sparkles, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Aviso } from "@/components/ui/Aviso";
import { Stepper } from "@/components/ui/Stepper";
import { Campo, CamposDoChamado, type CategoriaDaTela } from "./CamposDoChamado";
import { IconeDoArquivo } from "./LinhaDoTempo";
import { FORMATOS } from "@/lib/chamados/formatos";
import { formatInstantTime } from "@/lib/format";
import { iniciar, guardar, retirarAnexo, abrirChamado } from "@/app/(app)/chamados/actions";
import { categoriasClassificaveis, caminhoDaCategoria } from "@/lib/chamados/catalogo";
import { tituloDaDescricao, type DadosDoChamado, type RevisaoDaIa } from "@/lib/chamados/regras";

// Novo chamado em duas etapas (16/11/2026, funcionalidade-702): o pedido e a
// revisão. Na revisão a IA propõe o título e a categoria e faz até três
// perguntas; a pessoa confere, responde se quiser e abre o chamado. De 10/11 a
// 16/11 a tela tinha uma etapa só, e ninguém via nem aprovava o que a IA
// escolhia. Da conversa de antes de 10/11 isto não volta: é uma leitura só da
// IA, as respostas são opcionais e o "Abrir sem esperar" abre o chamado como
// foi escrito, sem aguardar a IA.
//
// O envio continua criando o chamado na hora, em "Aguardando triagem": a busca
// no Orquestrador roda depois, e a triagem respeita a categoria confirmada aqui.

type Anexo = { id: string; fileName: string };
type Rascunho = { id: string; version: number };
export type RascunhoDaTela = { id: string; version: number; dados: DadosDoChamado; anexos: Anexo[] };

type Setor = { code: string; label: string };
/**
 * `atendem`: os setores que administram os chamados (12/11/2026). Com dois ou
 * mais, a revisão mostra o setor que vai atender, proposto pela IA (16/11/2026,
 * funcionalidade-709); até então quem abria escolhia na etapa Pedido.
 */
/** `setorPadrao` (17/11/2026, bug-724): o setor ativo de quem abre, para quem está em mais de um não escolher toda vez. */
export function NovoChamado({ inicial, categorias, setores, atendem, setorPadrao }: { inicial: RascunhoDaTela | null; categorias: CategoriaDaTela[]; setores: Setor[]; atendem: Setor[]; setorPadrao?: string }) {
  const router = useRouter(), formulario = useRef<HTMLFormElement>(null);
  const [dados, setDados] = useState<DadosDoChamado>(inicial?.dados ?? { title: "", description: "", categoryId: "", requesterSectorCode: setores.length === 1 ? setores[0].code : setores.some(st => st.code === setorPadrao) ? setorPadrao ?? "" : "", priority: "MEDIA", requestData: {}, tags: [], handlingSectorCode: "" });
  const [anexos, setAnexos] = useState(inicial?.anexos ?? []);
  const [busy, setBusy] = useState(""), [erro, setErro] = useState(""), [salvoAs, setSalvoAs] = useState("");
  const abort = useRef<AbortController | null>(null);
  // Salvamento automático do pedido (27/10/2026). Toda gravação passa por uma
  // fila, porque cada uma muda a versão do rascunho e a seguinte precisa da
  // nova; os refs dão à fila os valores atuais, não os do render.
  const draftRef = useRef<Rascunho | null>(inicial ? { id: inicial.id, version: inicial.version } : null), dadosRef = useRef(dados), edicoes = useRef(0), salvas = useRef(0);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const podeSalvar = (d: DadosDoChamado) => !!d.description.trim() && !!d.requesterSectorCode;
  function definirRascunho(d: Rascunho) { draftRef.current = d; }
  function emFila<T>(tarefa: () => Promise<T>) { const p = fila.current.then(tarefa, tarefa); fila.current = p.catch(() => undefined); return p; }
  // A revisão. `undefined`: a IA ainda não leu este pedido; `null`: leu e não respondeu.
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [revisao, setRevisao] = useState<RevisaoDaIa | null | undefined>(undefined);
  const [categoria, setCategoria] = useState(""), [respostas, setRespostas] = useState<string[]>([]);
  const pedidoDaRevisao = useRef<AbortController | null>(null);
  function editar(novos: DadosDoChamado) {
    // Mudou o pedido: o título e a revisão eram de outro texto.
    const mudou = novos.description !== dadosRef.current.description;
    const atual = mudou ? { ...novos, title: "" } : novos;
    if (mudou) setRevisao(undefined);
    dadosRef.current = atual; setDados(atual); edicoes.current++;
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

  /**
   * Abre o chamado. Com a revisão, segue o que a pessoa aprovou: a categoria
   * (vazia = a equipe classifica) e as respostas dadas. Sem ela — o "Abrir sem
   * esperar" —, o chamado abre como foi escrito, e a triagem classifica.
   */
  function abrir(comRevisao: boolean) {
    if (!(formulario.current?.reportValidity() ?? false)) return;
    // Se a IA não respondeu e a pessoa não escolheu categoria, a triagem ainda tenta classificar.
    const abertura = comRevisao ? {
      revisao: revisao || categoria ? { categoryId: categoria || null, tags: revisao?.tags ?? [] } : null,
      respostas: (revisao?.perguntas ?? []).map((q, i) => ({ pergunta: q.text, resposta: (respostas[i] ?? "").trim() })).filter(r => r.resposta),
    } : undefined;
    void executar("abrindo", async () => {
      const d = await rascunhoAtual();
      const r = await abrirChamado(d.id, d.version, abertura); if (!r.ok) throw new Error(r.error);
      router.push(r.valor.endereco);
    });
  }
  /**
   * Pede a revisão à IA e vai para a etapa 2. É `fetch` numa rota, e não uma
   * action: as actions rodam em fila, e o "Abrir sem esperar" ficaria atrás
   * desta. Se a IA não responder, a etapa 2 abre sem a sugestão.
   */
  function continuar() {
    if (!(formulario.current?.reportValidity() ?? false)) return;
    if (revisao !== undefined) { setEtapa(2); window.scrollTo({ top: 0 }); return; }
    const controle = new AbortController(); pedidoDaRevisao.current = controle;
    setBusy("revisando"); setErro("");
    void (async () => {
      try {
        const d = await emFila(rascunhoAtual);
        if (controle.signal.aborted) return;
        const res = await fetch("/api/chamados/revisao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId: d.id }), signal: controle.signal });
        const corpo = await res.json() as { revisao?: RevisaoDaIa | null; error?: string };
        if (!res.ok) throw new Error(corpo.error ?? "Não foi possível revisar o pedido.");
        if (controle.signal.aborted) return;
        const nova = corpo.revisao ?? null, atual = dadosRef.current;
        setRevisao(nova); setCategoria(nova?.categoryId ?? ""); setRespostas((nova?.perguntas ?? []).map(() => ""));
        // Direto no estado, sem passar por `editar`: o pedido não mudou.
        const comTitulo = { ...atual, title: nova && nova.titulo.length >= 3 ? nova.titulo : tituloDaDescricao(atual.description), handlingSectorCode: nova?.setor ?? atual.handlingSectorCode };
        dadosRef.current = comTitulo; setDados(comTitulo); edicoes.current++;
        setEtapa(2); window.scrollTo({ top: 0 });
      } catch (e) {
        if (!controle.signal.aborted) setErro(e instanceof Error ? e.message : "Não foi possível revisar o pedido. Tente de novo ou abra sem esperar.");
      } finally {
        if (pedidoDaRevisao.current === controle) pedidoDaRevisao.current = null;
        setBusy(b => b === "revisando" ? "" : b);
      }
    })();
  }
  function abrirSemEsperar() { pedidoDaRevisao.current?.abort(); abrir(false); }
  useEffect(() => () => pedidoDaRevisao.current?.abort(), []);
  const opcoesDeCategoria = useMemo(() => categoriasClassificaveis(categorias).map(c => ({ id: c.id, caminho: caminhoDaCategoria(categorias, c.id) })).sort((a, b) => a.caminho.localeCompare(b.caminho, "pt-BR")), [categorias]);
  const caminhoDe = (id: string) => opcoesDeCategoria.find(o => o.id === id)?.caminho ?? "";
  function responder(i: number, valor: string) { setRespostas(r => r.map((x, j) => j === i ? valor : x)); }
  function subir(file: File) {
    void executar("Enviando arquivo…", async () => {
      const d = await obterRascunho(), form = new FormData(); form.set("id", crypto.randomUUID()); form.set("draftId", d.id); form.set("version", String(d.version)); form.set("file", file); form.set("attachmentKey", "");
      abort.current = new AbortController();
      const r = await fetch("/api/chamados/anexos", { method: "POST", body: form, signal: abort.current.signal });
      const resultado = await r.json(); if (!r.ok) throw new Error(resultado.error ?? "Falha no upload.");
      definirRascunho({ id: d.id, version: resultado.version }); setAnexos(a => [...a, { id: resultado.id, fileName: file.name }]);
    });
  }
  function retirar(a: Anexo) {
    void executar("Retirando anexo…", async () => {
      const d = draftRef.current; if (!d) return;
      const r = await retirarAnexo(d.id, a.id, d.version); if (!r.ok) throw new Error(r.error);
      definirRascunho({ id: d.id, version: r.valor.version }); setAnexos(lista => lista.filter(x => x.id !== a.id));
    });
  }

  // O setor que vai atender (16/11/2026, funcionalidade-709): a IA o propõe na
  // revisão, e a pessoa confirma ou troca. Na dúvida, a IA pergunta e a pessoa
  // escolhe. Sem a revisão ("Abrir sem esperar"), a triagem decide depois.
  const escolher = atendem.length > 1;
  const nomeDoSetor = (code: string) => atendem.find(s => s.code === code)?.label ?? code;

  const textoDeBusy = busy && busy !== "abrindo" && busy !== "revisando" ? busy : "";
  const sugerida = revisao?.categoryId ? caminhoDe(revisao.categoryId) : "", perguntas = revisao?.perguntas ?? [];
  return <form ref={formulario} onSubmit={e => { e.preventDefault(); if (etapa === 1) continuar(); else abrir(true); }} className="space-y-5">
    <Stepper steps={[{ label: "Pedido", status: etapa === 1 ? "current" : "done" }, { label: "Revisão", status: etapa === 2 ? "current" : "upcoming" }]} onStepClick={i => { if (i === 0 && etapa === 2 && !busy) setEtapa(1); }} />
    {etapa === 2 ? <Card className="p-5 sm:p-6">
      <fieldset disabled={!!busy} className="space-y-5">
        <div>
          <h2 className="text-heading font-semibold text-fg">Confira antes de abrir</h2>
          <p className="mt-1 text-ui text-fg-secondary">{revisao ? "A IA leu o pedido e sugeriu o título e a categoria. Ajuste o que não estiver certo." : "Confira o título e, se souber, escolha a categoria."}</p>
        </div>
        {!revisao && <Aviso tom="atencao" icone={<ScanSearch aria-hidden />}>A IA não conseguiu ler o pedido agora. Você pode abrir o chamado mesmo assim: a triagem tenta classificar de novo, e a equipe confere.</Aviso>}
        <div className="rounded-lg bg-surface-hover p-3">
          <p className="text-helper font-medium text-fg-secondary">Seu pedido</p>
          <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-ui text-fg">{dados.description}</p>
        </div>
        <Campo label="Título"><Input required minLength={3} maxLength={255} value={dados.title} onChange={e => editar({ ...dados, title: e.target.value })} placeholder="O que você precisa?" /></Campo>
        <div className="space-y-1.5">
          <Campo label="Categoria"><Select value={categoria} onChange={e => setCategoria(e.target.value)}><option value="">Deixar para a equipe classificar</option>{opcoesDeCategoria.map(o => <option key={o.id} value={o.id}>{o.caminho}</option>)}</Select></Campo>
          {sugerida ? <p className="flex flex-wrap items-start gap-1.5 text-helper text-fg-secondary"><Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-brand" /><span>Sugestão da IA: <strong className="text-fg">{sugerida}</strong>{revisao?.motivo ? ` — ${revisao.motivo}` : ""}</span>{categoria !== revisao?.categoryId && <Button variant="link" onClick={() => setCategoria(revisao?.categoryId ?? "")}>Usar a sugestão</Button>}</p>
            : revisao ? <p className="text-helper text-fg-muted">A IA não identificou a categoria só pela descrição. Escolha uma, ou deixe para a equipe classificar.</p> : null}
        </div>
        {escolher && <div className="space-y-1.5">
          <Campo label="Setor que vai atender"><Select required value={dados.handlingSectorCode} onChange={e => editar({ ...dados, handlingSectorCode: e.target.value })}><option value="">Selecione o setor</option>{atendem.map(st => <option key={st.code} value={st.code}>{st.label}</option>)}</Select></Campo>
          {revisao?.setor ? <p className="flex flex-wrap items-start gap-1.5 text-helper text-fg-secondary"><Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-brand" /><span>Sugestão da IA: <strong className="text-fg">{nomeDoSetor(revisao.setor)}</strong>{revisao.motivoDoSetor ? ` — ${revisao.motivoDoSetor}` : ""}</span>{dados.handlingSectorCode !== revisao.setor && <Button variant="link" onClick={() => editar({ ...dados, handlingSectorCode: revisao.setor ?? "" })}>Usar a sugestão</Button>}</p>
            : revisao?.perguntaDoSetor ? <Aviso tom="info" icone={<Sparkles aria-hidden />}><p className="font-semibold">A IA ficou em dúvida sobre o setor</p><p>{revisao.perguntaDoSetor}</p><p>Escolha acima o setor que vai atender.</p></Aviso>
            : <p className="text-helper text-fg-muted">Escolha o setor que vai atender o pedido.</p>}
        </div>}
        {perguntas.length > 0 && <section aria-labelledby="perguntas-da-ia" className="space-y-4 rounded-lg border border-border p-4">
          <h3 id="perguntas-da-ia" className="text-ui font-semibold text-fg">Perguntas da IA <span className="font-normal text-fg-muted">(opcional)</span></h3>
          {perguntas.map((q, i) => <div key={q.text} className="space-y-2">
            <p className="text-ui font-medium text-fg">{q.text}</p>
            {q.options.length > 0 && <div className="flex flex-wrap gap-2">{q.options.map(o => <button key={o} type="button" aria-pressed={respostas[i] === o} onClick={() => responder(i, respostas[i] === o ? "" : o)} className={`min-h-9 rounded-md border px-3 py-1.5 text-left text-ui font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${respostas[i] === o ? "border-brand bg-brand/8 text-brand" : "border-border-strong text-fg hover:bg-surface-hover"}`}>{o}</button>)}</div>}
            <Input aria-label={`Resposta: ${q.text}`} maxLength={2000} value={respostas[i] ?? ""} onChange={e => responder(i, e.target.value)} placeholder={q.options.length ? "Ou escreva a resposta" : "Escreva a resposta"} />
          </div>)}
        </section>}
      </fieldset>
    </Card> : <>
    <Card className="p-5 sm:p-6">
      <fieldset disabled={!!busy} className="space-y-5">
        <h2 className="text-heading font-semibold text-fg">Detalhes do chamado</h2>
        <CamposDoChamado dados={dados} onChange={editar} categorias={categorias} setores={setores} ocultarCategoria ocultarTitulo ocultarTags abertura />
      </fieldset>
    </Card>
    <Card className="min-w-0">
      <PainelDeAnexos anexos={anexos} busy={busy} onSubir={subir} onRetirar={retirar} />
    </Card>
    </>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 max-w-2xl space-y-1">
        {/* O que a IA faz em cada etapa foi para o artigo de ajuda (17/11/2026, melhoria-707): aqui fica só o andamento. */}
        {busy === "revisando" && <p role="status" className="text-ui text-fg-secondary">A IA está lendo o pedido. Costuma levar alguns segundos; se preferir, abra sem esperar.</p>}
        {salvoAs && <p className="text-helper text-fg-muted" role="status">Rascunho salvo às {salvoAs}</p>}
        {textoDeBusy && <p role="status" className="text-ui text-fg-secondary">{textoDeBusy} {textoDeBusy === "Enviando arquivo…" && <Button variant="link" onClick={() => abort.current?.abort()}>Parar envio</Button>}</p>}
        {erro && <p role="alert" className="text-ui text-danger">{erro} <Button variant="link" onClick={() => window.location.reload()}>Recarregar rascunho salvo</Button></p>}
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {etapa === 2 && <Button variant="secondary" size="lg" disabled={!!busy} onClick={() => setEtapa(1)}><ArrowLeft size={16} aria-hidden />Voltar</Button>}
        {busy === "revisando" && <Button variant="secondary" size="lg" onClick={abrirSemEsperar}>Abrir sem esperar</Button>}
        {etapa === 1
          ? <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56" disabled={!!busy} loading={busy === "revisando" || busy === "abrindo"} loadingLabel={busy === "abrindo" ? "Abrindo o chamado…" : "A IA está lendo o pedido…"}>Continuar</Button>
          : <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56" disabled={!!busy} loading={busy === "abrindo"} loadingLabel="Abrindo o chamado…">Abrir chamado</Button>}
      </div>
    </div>
  </form>;
}

// Sem o "Tipo de evidência" (10/11/2026): a categoria só existe depois da
// triagem, então os anexos da abertura são todos complementares.
function PainelDeAnexos({ anexos, busy, onSubir, onRetirar }: { anexos: Anexo[]; busy: string; onSubir: (f: File) => void; onRetirar: (a: Anexo) => void }) {
  const seletor = useRef<HTMLInputElement>(null), [arrastando, setArrastando] = useState(false);
  return <section aria-labelledby="anexos-do-chamado" className="space-y-3 p-5">
    <div className="flex items-baseline justify-between gap-2">
      <h2 id="anexos-do-chamado" className="font-semibold text-fg">Anexos</h2>
      {!!anexos.length && <span className="text-helper text-fg-muted">{`${anexos.length} ${anexos.length === 1 ? "arquivo" : "arquivos"}`}</span>}
    </div>
    <div onDragOver={e => { e.preventDefault(); if (!busy) setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={e => { e.preventDefault(); setArrastando(false); const file = e.dataTransfer.files[0]; if (file && !busy) onSubir(file); }}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${arrastando ? "border-brand bg-brand/5" : "border-border-strong"}`}>
      <div aria-hidden className="flex items-center gap-2.5 text-fg-muted"><FileText size={18} /><FileImage size={18} /><FileSpreadsheet size={18} /><FileVideo size={18} /></div>
      <p className="text-ui text-fg-secondary">Arraste um arquivo para cá ou</p>
      <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => seletor.current?.click()}><Upload size={14} aria-hidden />Escolher arquivo</Button>
      <input ref={seletor} aria-label="Adicionar arquivo" type="file" accept={FORMATOS} hidden disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onSubir(file); }} />
    </div>
    <p className="text-helper text-fg-muted">PDF, imagem, planilha, DOCX, TXT, ZIP ou vídeo, um por vez, até 10 MB.</p>
    {!!anexos.length && <ul aria-label="Arquivos anexados" className="space-y-1.5">{anexos.map(a => <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-surface-hover py-1.5 pl-2.5 pr-1 text-helper">
      <IconeDoArquivo nome={a.fileName} />
      <span className="min-w-0 flex-1"><a className="block truncate text-fg hover:text-brand hover:underline" href={`/api/chamados/anexos/${a.id}`} download data-dica={a.fileName}>{a.fileName}</a></span>
      <button type="button" disabled={!!busy} aria-label={`Retirar ${a.fileName}`} title="Retirar" onClick={() => onRetirar(a)} className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><X size={12} /></button>
    </li>)}</ul>}
  </section>;
}
