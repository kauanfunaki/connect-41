"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Paperclip, PenLine, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { responder } from "@/app/(app)/chamados/actions";
import { FORMATOS } from "@/lib/chamados/formatos";
import { tamanhoDoArquivo } from "@/lib/chamados/linhaDoTempo";
import { caixaAberta, resumoDoRascunho, type EventoDaCaixa } from "@/lib/chamados/caixaDeMensagem";
import { IconeDoArquivo } from "./LinhaDoTempo";
import { uploadComProgresso } from "@/lib/uploadComProgresso";

const LIMITE = 10 * 1024 * 1024, ACEITOS = FORMATOS.split(","), ALTURA_MAXIMA = 320, ALTURA_RECOLHIDA = 24;
type Pendente = { id: string; file: File; enviado: boolean };

// Mensagem e arquivos num envio só (26/10/2026): o clipe abre o seletor, o Ctrl+V
// cola prints e arquivos, e cada arquivo sobe pela rota de anexos antes da
// mensagem, que os prende a ela. Um arquivo que já subiu não sobe de novo se a
// mensagem falhar e a pessoa tentar outra vez.
//
// Começa recolhida (05/11/2026, opção A da tela do chamado): uma linha
// "Escrever uma resposta…" com o clipe, para a conversa aparecer inteira. É o
// MESMO campo de texto nos dois estados — recolhido ele só tem uma linha e a
// barra de ações some —, então focar já é escrever, o Ctrl+V de um print na
// linha recolhida cai no mesmo `onPaste`, e o rascunho fica onde estava. Quando
// abre e recolhe está em `caixaAberta` (lib/chamados/caixaDeMensagem.ts).
export function CaixaDeMensagem({ chamado, podeInterno, abertaInicial = false }: { chamado: { id: string; draftId: string; version: number }; podeInterno: boolean; abertaInicial?: boolean }) {
  const router = useRouter(), seletor = useRef<HTMLInputElement>(null), campo = useRef<HTMLTextAreaElement>(null), clipeRecolhido = useRef<HTMLSpanElement>(null);
  const [texto, setTexto] = useState(""), [arquivos, setArquivos] = useState<Pendente[]>([]), [interno, setInterno] = useState(false);
  const [aberta, setAberta] = useState(abertaInicial);
  const rascunho = { texto, arquivos: arquivos.length };
  const avisar = (e: EventoDaCaixa) => setAberta(a => caixaAberta(a, e, rascunho));
  // O "Recolher" some junto com a barra: o foco vai para o clipe da linha
  // recolhida, e não para o <body> (o campo reabriria a caixa ao receber foco).
  const focarClipe = useRef(false);
  useEffect(() => {
    if (!aberta && focarClipe.current) { focarClipe.current = false; clipeRecolhido.current?.querySelector("button")?.focus(); }
  }, [aberta]);
  // O campo cresce com o texto até o teto e volta ao enviar. A alça nativa de
  // redimensionar ficava solta no canto, acima da barra de ações.
  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    if (!aberta) { el.style.height = `${ALTURA_RECOLHIDA}px`; el.style.overflowY = "hidden"; return; }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA)}px`;
    el.style.overflowY = el.scrollHeight > ALTURA_MAXIMA ? "auto" : "hidden";
  }, [texto, aberta]);
  const [busy, setBusy] = useState(false), [erro, setErro] = useState("");
  const [progresso, setProgresso] = useState<Record<string, number>>({});
  const requestId = useRef(crypto.randomUUID()), versao = useRef(chamado.version);
  const subiu = arquivos.some(a => a.enviado);
  function adicionar(lista: File[], evento: EventoDaCaixa = "anexar") {
    const recusados: string[] = [];
    const novos = lista.flatMap(f => {
      const ext = `.${f.name.split(".").pop()?.toLowerCase() ?? ""}`;
      if (f.size === 0 || f.size > LIMITE || !ACEITOS.includes(ext)) { recusados.push(f.name); return []; }
      // Print colado chega como "image.png"; um nome com a hora separa um do outro.
      const file = /^image\.\w+$/i.test(f.name) ? new File([f], `imagem-colada-${new Date().toTimeString().slice(0, 8).replaceAll(":", "")}${ext}`, { type: f.type }) : f;
      return [{ id: crypto.randomUUID(), file, enviado: false }];
    });
    setErro(recusados.length ? `Não anexado: ${recusados.join(", ")}. Envie arquivos de até 10 MB nos formatos ${ACEITOS.join(" ").replaceAll(".", "").toUpperCase()}.` : "");
    if (novos.length) setArquivos(a => [...a, ...novos]);
    // Abre mesmo com o arquivo recusado: o aviso do porquê fica junto da caixa.
    if (lista.length) avisar(evento);
  }
  async function enviar() {
    if (busy || (!texto.trim() && !arquivos.length)) return;
    setBusy(true); setErro("");
    try {
      for (const a of arquivos) {
        if (a.enviado) continue;
        const f = new FormData(); f.set("id", a.id); f.set("draftId", chamado.draftId); f.set("ticketId", chamado.id); f.set("version", String(versao.current)); f.set("file", a.file); f.set("mensagem", "1"); if (interno) f.set("internal", "1");
        // Com progresso por arquivo (auditoria de UX, 30/10/2026), como em Arquivos: eram até 10 MB só com "Enviando…".
        const r = await uploadComProgresso("/api/chamados/anexos", f, p => setProgresso(m => ({ ...m, [a.id]: p })));
        if (!r.ok) throw new Error(`${a.file.name}: ${r.erro}`);
        versao.current = (r.body as { version: number }).version; setArquivos(lista => lista.map(x => x.id === a.id ? { ...x, enviado: true } : x));
      }
      const r = await responder(chamado.id, versao.current, { requestId: requestId.current, body: texto, internal: interno, attachmentIds: arquivos.map(a => a.id) });
      if (!r.ok) throw new Error(r.error);
      setTexto(""); setArquivos([]); requestId.current = crypto.randomUUID(); campo.current?.blur(); avisar("enviado"); router.refresh();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível enviar. Atualize a página."); }
    finally { setBusy(false); }
  }
  const resumo = resumoDoRascunho(rascunho);
  const moldura = aberta
    ? `space-y-2 p-3 focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] ${interno ? "border-warning/40 bg-warning/5" : "border-border-strong bg-surface"}`
    : "border-border-strong bg-input-bg py-2 pl-3 pr-1.5 hover:border-brand/50";
  return <form onSubmit={e => { e.preventDefault(); void enviar(); }} className={`rounded-lg border transition-colors ${moldura}`}>
    {/* A linha inteira recebe o clique, não só o texto: clicar na margem também começa a resposta. */}
    <div className={`flex gap-2 ${aberta ? "" : "cursor-text items-center"}`} onClick={e => { if (!aberta && e.target === e.currentTarget) campo.current?.focus(); }}>
      {!aberta && <PenLine size={15} aria-hidden className="shrink-0 text-fg-muted" />}
      <Textarea ref={campo} aria-label={interno ? "Nota interna" : "Resposta pública"} rows={aberta ? 3 : 1} maxLength={15000} disabled={busy} value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={!aberta ? "Escrever uma resposta…" : interno ? "Nota visível só para a equipe…" : "Escreva uma mensagem. Cole prints e arquivos com Ctrl+V."}
        className={`min-w-0 flex-1 border-0! bg-transparent! p-0! focus:shadow-none! ${aberta ? "min-h-16!" : "min-h-0! cursor-text leading-6"}`}
        onFocus={() => avisar("focar")}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void enviar(); }
          // Esc só recolhe a caixa vazia; com rascunho não faz nada, para não parecer que apagou.
          else if (e.key === "Escape" && caixaAberta(aberta, "esc", rascunho) !== aberta) { e.preventDefault(); e.currentTarget.blur(); avisar("esc"); }
        }}
        onPaste={e => { const files = [...e.clipboardData.files]; if (files.length && !e.clipboardData.getData("text/plain")) { e.preventDefault(); adicionar(files, "colar-arquivo"); } }} />
      {!aberta && <>
        {resumo && <span className="shrink-0 rounded-md bg-surface-hover px-2 py-0.5 text-helper text-fg-secondary">{resumo}</span>}
        <span ref={clipeRecolhido} className="contents"><IconButton title="Anexar arquivos" size="sm" disabled={busy} onClick={() => seletor.current?.click()}><Paperclip size={15} /></IconButton></span>
      </>}
    </div>
    <input ref={seletor} type="file" multiple accept={FORMATOS} hidden aria-hidden tabIndex={-1} onChange={e => { adicionar([...e.target.files ?? []]); e.target.value = ""; }} />
    {aberta && !!arquivos.length && <ul aria-label="Arquivos para enviar" className="flex flex-wrap gap-2">{arquivos.map(a => <li key={a.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-hover py-1 pl-2 pr-1 text-helper text-fg-secondary"><IconeDoArquivo nome={a.file.name} /><span className="min-w-0 truncate text-fg">{a.file.name}</span><span className="shrink-0 text-fg-muted">{tamanhoDoArquivo(a.file.size)}</span>{busy && !a.enviado && progresso[a.id] !== undefined && <span role="status" className="shrink-0 tabular-nums text-brand">{progresso[a.id]}%</span>}{!a.enviado && <button type="button" disabled={busy} aria-label={`Retirar ${a.file.name}`} onClick={() => setArquivos(lista => lista.filter(x => x.id !== a.id))} className="inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><X size={12} /></button>}</li>)}</ul>}
    {aberta && <div className="flex flex-wrap items-center gap-2">
      <IconButton title="Anexar arquivos" disabled={busy} onClick={() => seletor.current?.click()}><Paperclip size={16} /></IconButton>
      {podeInterno && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-helper text-fg-secondary hover:bg-surface-hover"><Checkbox checked={interno} disabled={busy || subiu} onChange={e => setInterno(e.target.checked)} /><Lock size={13} aria-hidden className={interno ? "text-warning-fg" : "text-fg-muted"} />Somente a equipe</label>}
      <span className="ml-auto hidden text-micro text-fg-muted sm:inline">Ctrl+Enter envia</span>
      {/* Recolhe sem perder nada: o texto e os arquivos esperam na linha recolhida. */}
      <IconButton title="Recolher a caixa (o rascunho fica)" disabled={busy} className="max-sm:ml-auto" onClick={() => { focarClipe.current = true; avisar("recolher"); }}><ChevronDown size={16} /></IconButton>
      <Button type="submit" size="sm" disabled={busy || (!texto.trim() && !arquivos.length)} loading={busy} loadingLabel="Enviando…"><SendHorizontal size={14} />Enviar mensagem</Button>
    </div>}
    {erro && <p role="alert" className={`text-helper text-danger ${aberta ? "" : "mt-1.5 pr-1.5"}`}>{erro}</p>}
  </form>;
}
