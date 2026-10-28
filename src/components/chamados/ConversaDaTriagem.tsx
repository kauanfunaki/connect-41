"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ConnectLoadingIndicator } from "@/components/shared/ConnectLoadingScreen";
import { FORMATOS } from "@/lib/chamados/formatos";
import type { Parecer } from "@/lib/chamados/regras";

// A análise do chamado em conversa (28/10/2026): ao enviar, um modal com o
// carregamento do Connect enquanto a IA lê; com a resposta, ele cresce e vira
// conversa, um balão por mensagem. Perguntas fechadas trazem as respostas em
// botões, e escrever continua possível. O clipe anexa um arquivo à conversa.

// 8 frases e a primeira de novo: a animação das palavras tem 8 passos.
const FRASES = ["lendo a descrição", "entendendo o contexto", "conferindo os anexos", "identificando a categoria", "relacionando as informações", "verificando o que falta", "preparando a revisão", "organizando o pedido", "lendo a descrição"];

export type Mensagem = { id: string; role: string; body: string };
type Props = {
  aberta: boolean; onFechar: () => void;
  mensagens: Mensagem[]; parecer: Parecer | null; pergunta: { indice: number; total: number } | null;
  /** O que está em andamento: "analisando" mostra o carregamento; os outros, só travam os controles. */
  busy: string; erro: string;
  onResponder: (texto: string) => void; onAnexar: (file: File) => void; onPararEnvio: () => void;
  /** Há arquivo anexado na conversa ainda sem resposta: enviar só com ele vale. */
  anexou: boolean;
  onEnviarMesmoAssim: () => void; onTentarNovamente: () => void;
};

export function ConversaDaTriagem({ aberta, onFechar, mensagens, parecer, pergunta, busy, erro, onResponder, onAnexar, onPararEnvio, anexou, onEnviarMesmoAssim, onTentarNovamente }: Props) {
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null), seletor = useRef<HTMLInputElement>(null);
  const analisando = busy === "analisando", conversa = mensagens.length > 0;
  const opcoes = pergunta ? parecer?.questions[pergunta.indice]?.options ?? [] : [];
  useEffect(() => { fim.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [mensagens.length, analisando]);
  function responder(valor: string) {
    if ((!valor.trim() && !anexou) || busy) return;
    onResponder(valor.trim()); setTexto("");
  }
  // Enquanto a IA lê, fechar não cancela nada no servidor; só travamos o X.
  const fechar = () => { if (!analisando) onFechar(); };

  return <Modal open={aberta} onClose={fechar} title={conversa ? "Revisão do chamado" : undefined} maxWidth={`${conversa ? "max-w-2xl" : "max-w-sm"} transition-[max-width] duration-300`}>
    {!conversa ? <div className="pb-4">
      <ConnectLoadingIndicator label="A IA está" words={FRASES} subtitle={busy === "enviando" ? "Abrindo o chamado" : "Processando as informações do chamado"} />
      {erro && <p role="alert" className="mt-4 text-center text-ui text-danger">{erro}</p>}
    </div> : <div className="flex max-h-[min(36rem,calc(100dvh-10rem))] flex-col gap-4">
      <div role="log" aria-label="Conversa da revisão" aria-live="polite" className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 py-1">
        {mensagens.map(m => <Balao key={m.id} daIA={m.role !== "user"}>{m.body}</Balao>)}
        {busy === "Enviando arquivo…" && <Balao daIA={false}><span className="inline-flex items-center gap-2"><Digitando />Enviando arquivo <button type="button" onClick={onPararEnvio} className="underline">parar</button></span></Balao>}
        {analisando && <Balao daIA><span className="inline-flex items-center gap-2 text-fg-secondary"><Digitando />Analisando sua resposta</span></Balao>}
        {opcoes.length > 0 && !analisando && <div role="group" aria-label="Respostas sugeridas" className="flex flex-wrap gap-2 pl-1">
          {opcoes.map(o => <button key={o} type="button" disabled={!!busy} onClick={() => responder(o)}
            className="rounded-full border border-brand/40 bg-surface px-3.5 py-1.5 text-ui font-medium text-brand transition-colors hover:bg-brand/8 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50">{o}</button>)}
        </div>}
        <div ref={fim} />
      </div>
      {pergunta && <form onSubmit={e => { e.preventDefault(); responder(texto); }} className="flex items-end gap-2">
        <label className="sr-only" htmlFor="resposta-da-revisao">{pergunta.total > 1 ? `Sua resposta, pergunta ${pergunta.indice + 1} de ${pergunta.total}` : "Sua resposta"}</label>
        {/* Enter envia, como num app de conversa; Shift+Enter quebra a linha. */}
        <Textarea id="resposta-da-revisao" rows={1} maxLength={10000} disabled={!!busy} value={texto} onChange={e => setTexto(e.target.value)}
          placeholder={opcoes.length ? "Escolha uma opção ou escreva" : "Escreva sua resposta"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); responder(texto); } }}
          className="field-sizing-content max-h-32 min-h-12! flex-1 rounded-2xl" />
        <input ref={seletor} type="file" accept={FORMATOS} hidden aria-label="Anexar arquivo à conversa" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onAnexar(file); }} />
        <Button type="button" variant="secondary" size="icon" className="size-12! shrink-0 rounded-2xl!" disabled={!!busy} aria-label="Anexar arquivo" title="Anexar arquivo (até 10 MB)" onClick={() => seletor.current?.click()}><Paperclip size={18} /></Button>
        <Button type="submit" size="icon" className="size-12! shrink-0 rounded-2xl!" disabled={!!busy || (!texto.trim() && !anexou)} aria-label="Enviar resposta"><SendHorizontal size={18} /></Button>
      </form>}
      {erro && <p role="alert" className="text-ui text-danger">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-helper text-fg-muted">{pergunta && pergunta.total > 1 ? `Pergunta ${pergunta.indice + 1} de ${pergunta.total}` : ""}</span>
        <div className="flex flex-wrap gap-2">
          {parecer?.status === "unavailable" && <Button variant="ghost" disabled={!!busy} onClick={onTentarNovamente}>Tentar análise novamente</Button>}
          <Button variant="secondary" disabled={!!busy} onClick={onEnviarMesmoAssim}>{parecer?.status === "unavailable" ? "Enviar sem análise" : "Enviar mesmo assim"}</Button>
        </div>
      </div>
    </div>}
  </Modal>;
}

function Balao({ daIA, children }: { daIA: boolean; children: React.ReactNode }) {
  return <div className={`flex ${daIA ? "justify-start" : "justify-end"}`}>
    <div className={`c41-surgir max-w-[85%] whitespace-pre-wrap break-words px-4 py-2.5 text-ui shadow-xs ${daIA ? "rounded-2xl rounded-bl-md bg-surface-hover text-fg" : "rounded-2xl rounded-br-md bg-brand-solid text-on-brand"}`}>
      <span className="sr-only">{daIA ? "Assistente: " : "Você: "}</span>{children}
    </div>
  </div>;
}

function Digitando() {
  return <span aria-hidden className="inline-flex gap-1">{[0, 150, 300].map(d => <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: `${d}ms` }} />)}</span>;
}
