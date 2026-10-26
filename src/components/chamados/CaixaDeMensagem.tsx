"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Paperclip, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { responder } from "@/app/(app)/chamados/actions";
import { FORMATOS } from "@/lib/chamados/formatos";
import { tamanhoDoArquivo } from "@/lib/chamados/linhaDoTempo";
import { IconeDoArquivo } from "./LinhaDoTempo";

const LIMITE = 10 * 1024 * 1024, ACEITOS = FORMATOS.split(",");
type Pendente = { id: string; file: File; enviado: boolean };

// Mensagem e arquivos num envio só (26/10/2026): o clipe abre o seletor, o Ctrl+V
// cola prints e arquivos, e cada arquivo sobe pela rota de anexos antes da
// mensagem, que os prende a ela. Um arquivo que já subiu não sobe de novo se a
// mensagem falhar e a pessoa tentar outra vez.
export function CaixaDeMensagem({ chamado, podeInterno }: { chamado: { id: string; draftId: string; version: number }; podeInterno: boolean }) {
  const router = useRouter(), seletor = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState(""), [arquivos, setArquivos] = useState<Pendente[]>([]), [interno, setInterno] = useState(false);
  const [busy, setBusy] = useState(false), [erro, setErro] = useState("");
  const requestId = useRef(crypto.randomUUID()), versao = useRef(chamado.version);
  const subiu = arquivos.some(a => a.enviado);
  function adicionar(lista: File[]) {
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
  }
  async function enviar() {
    if (busy || (!texto.trim() && !arquivos.length)) return;
    setBusy(true); setErro("");
    try {
      for (const a of arquivos) {
        if (a.enviado) continue;
        const f = new FormData(); f.set("id", a.id); f.set("draftId", chamado.draftId); f.set("ticketId", chamado.id); f.set("version", String(versao.current)); f.set("file", a.file); f.set("mensagem", "1"); if (interno) f.set("internal", "1");
        const r = await fetch("/api/chamados/anexos", { method: "POST", body: f }), d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`${a.file.name}: ${d.error ?? "Falha no envio do arquivo."}`);
        versao.current = d.version; setArquivos(lista => lista.map(x => x.id === a.id ? { ...x, enviado: true } : x));
      }
      const r = await responder(chamado.id, versao.current, { requestId: requestId.current, body: texto, internal: interno, attachmentIds: arquivos.map(a => a.id) });
      if (!r.ok) throw new Error(r.error);
      setTexto(""); setArquivos([]); requestId.current = crypto.randomUUID(); router.refresh();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível enviar. Atualize a página."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={e => { e.preventDefault(); void enviar(); }} className={`space-y-2 rounded-lg border p-3 transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] ${interno ? "border-warning/40 bg-warning/5" : "border-border-strong bg-surface"}`}>
    <Textarea aria-label={interno ? "Nota interna" : "Resposta pública"} rows={3} maxLength={15000} disabled={busy} value={texto} onChange={e => setTexto(e.target.value)} placeholder={interno ? "Nota visível só para a equipe…" : "Escreva uma mensagem. Cole prints e arquivos com Ctrl+V."} className="min-h-16! resize-y border-0! bg-transparent! p-0! focus:shadow-none!"
      onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void enviar(); } }}
      onPaste={e => { const files = [...e.clipboardData.files]; if (files.length && !e.clipboardData.getData("text/plain")) { e.preventDefault(); adicionar(files); } }} />
    {!!arquivos.length && <ul aria-label="Arquivos para enviar" className="flex flex-wrap gap-2">{arquivos.map(a => <li key={a.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-hover py-1 pl-2 pr-1 text-helper text-fg-secondary"><IconeDoArquivo nome={a.file.name} /><span className="min-w-0 truncate text-fg">{a.file.name}</span><span className="shrink-0 text-fg-muted">{tamanhoDoArquivo(a.file.size)}</span>{!a.enviado && <button type="button" disabled={busy} aria-label={`Retirar ${a.file.name}`} onClick={() => setArquivos(lista => lista.filter(x => x.id !== a.id))} className="inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><X size={12} /></button>}</li>)}</ul>}
    <div className="flex flex-wrap items-center gap-2">
      <IconButton title="Anexar arquivos" disabled={busy} onClick={() => seletor.current?.click()}><Paperclip size={16} /></IconButton>
      <input ref={seletor} type="file" multiple accept={FORMATOS} hidden aria-hidden tabIndex={-1} onChange={e => { adicionar([...e.target.files ?? []]); e.target.value = ""; }} />
      {podeInterno && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-helper text-fg-secondary hover:bg-surface-hover"><Checkbox checked={interno} disabled={busy || subiu} onChange={e => setInterno(e.target.checked)} /><Lock size={13} aria-hidden className={interno ? "text-warning-fg" : "text-fg-muted"} />Somente a equipe</label>}
      <span className="ml-auto hidden text-micro text-fg-muted sm:inline">Ctrl+Enter envia</span>
      <Button type="submit" size="sm" disabled={busy || (!texto.trim() && !arquivos.length)} loading={busy} loadingLabel="Enviando…" className="max-sm:ml-auto"><SendHorizontal size={14} />Enviar mensagem</Button>
    </div>
    {erro && <p role="alert" className="text-helper text-danger">{erro}</p>}
  </form>;
}
