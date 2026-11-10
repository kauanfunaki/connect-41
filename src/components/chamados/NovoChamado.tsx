"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, FileSpreadsheet, FileText, FileVideo, ScanSearch, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CamposDoChamado, type CategoriaDaTela } from "./CamposDoChamado";
import { IconeDoArquivo } from "./LinhaDoTempo";
import { FORMATOS } from "@/lib/chamados/formatos";
import { formatInstantTime } from "@/lib/format";
import { iniciar, guardar, retirarAnexo, abrirChamado } from "@/app/(app)/chamados/actions";
import type { DadosDoChamado } from "@/lib/chamados/regras";

// Novo chamado em uma etapa (10/11/2026). Até aqui a pessoa esperava a IA na
// tela — classificação, conversa e revisão — antes de o chamado existir. Agora
// o envio cria o chamado na hora, em "Aguardando triagem", e a triagem roda
// depois: a tela do chamado se atualiza sozinha e o sino avisa o resultado.

type Anexo = { id: string; fileName: string };
type Rascunho = { id: string; version: number };
export type RascunhoDaTela = { id: string; version: number; dados: DadosDoChamado; anexos: Anexo[] };

export function NovoChamado({ inicial, categorias, setores }: { inicial: RascunhoDaTela | null; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[] }) {
  const router = useRouter(), formulario = useRef<HTMLFormElement>(null);
  const [dados, setDados] = useState<DadosDoChamado>(inicial?.dados ?? { title: "", description: "", categoryId: "", requesterSectorCode: setores.length === 1 ? setores[0].code : "", priority: "MEDIA", requestData: {}, tags: [] });
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
  function editar(novos: DadosDoChamado) { dadosRef.current = novos; setDados(novos); edicoes.current++; }
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

  function abrir() {
    if (!(formulario.current?.reportValidity() ?? false)) return;
    void executar("abrindo", async () => {
      const d = await rascunhoAtual();
      const r = await abrirChamado(d.id, d.version); if (!r.ok) throw new Error(r.error);
      router.push(`/chamados/${r.valor.ticketId}`);
    });
  }
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

  const textoDeBusy = busy && busy !== "abrindo" ? busy : "";
  return <form ref={formulario} onSubmit={e => { e.preventDefault(); abrir(); }} className="space-y-5">
    <Card className="p-5 sm:p-6">
      <fieldset disabled={!!busy} className="space-y-5">
        <h2 className="text-heading font-semibold text-fg">Detalhes do chamado</h2>
        <CamposDoChamado dados={dados} onChange={editar} categorias={categorias} setores={setores} ocultarCategoria ocultarTitulo ocultarTags abertura />
      </fieldset>
    </Card>
    <Card className="min-w-0">
      <PainelDeAnexos anexos={anexos} busy={busy} onSubir={subir} onRetirar={retirar} />
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 max-w-2xl space-y-1">
        <p className="flex items-start gap-2 text-ui text-fg-secondary"><ScanSearch size={16} aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />O chamado abre na hora. Depois, a IA confere se já existe no Orquestrador algo que faça o pedido e classifica o chamado; você é avisado no sino quando terminar.</p>
        {salvoAs && <p className="text-helper text-fg-muted" role="status">Rascunho salvo às {salvoAs}</p>}
        {textoDeBusy && <p role="status" className="text-ui text-fg-secondary">{textoDeBusy} {textoDeBusy === "Enviando arquivo…" && <Button variant="link" onClick={() => abort.current?.abort()}>Parar envio</Button>}</p>}
        {erro && <p role="alert" className="text-ui text-danger">{erro} <Button variant="link" onClick={() => window.location.reload()}>Recarregar rascunho salvo</Button></p>}
      </div>
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56" disabled={!!busy} loading={busy === "abrindo"} loadingLabel="Abrindo o chamado…">Abrir chamado</Button>
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
