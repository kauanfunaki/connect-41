"use client";

import { useEffect, useRef, useState } from "react";
import { AppWindow, ArrowLeft, Bot, Check, Copy, ExternalLink, Globe, Paperclip, SendHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ConnectLoadingIndicator } from "@/components/shared/ConnectLoadingScreen";
import { FORMATOS } from "@/lib/chamados/formatos";
import { ROTULOS_EXISTENTE, type Existente, type Parecer } from "@/lib/chamados/regras";

// Etapa 2 do novo chamado (28/10/2026): a conversa com a IA na própria página,
// um balão por mensagem. Perguntas fechadas trazem as respostas em botões, e
// escrever continua possível; o clipe anexa um arquivo. Enquanto a IA lê, quem
// aparece é o modal de carregamento (CarregandoIA), não a conversa.

// 8 frases e a primeira de novo: a animação das palavras tem 8 passos.
const FRASES = ["lendo a descrição", "entendendo o contexto", "conferindo os anexos", "identificando a categoria", "relacionando as informações", "verificando o que falta", "montando o chamado", "organizando o pedido", "lendo a descrição"];

/** O carregamento do Connect enquanto a IA processa; não fecha no meio. */
export function CarregandoIA({ aberto, subtitulo }: { aberto: boolean; subtitulo: string }) {
  return <Modal open={aberto} onClose={() => {}} maxWidth="max-w-sm">
    <div className="pb-4"><ConnectLoadingIndicator label="A IA está" words={FRASES} subtitle={subtitulo} /></div>
  </Modal>;
}

export type Mensagem = { id: string; role: string; body: string };
type Props = {
  mensagens: Mensagem[]; parecer: Parecer | null; pergunta: { indice: number; total: number } | null;
  busy: string; erro: string;
  onResponder: (texto: string) => void; onAnexar: (file: File) => void; onPararEnvio: () => void;
  /** Há arquivo anexado na conversa ainda sem resposta: enviar só com ele vale. */
  anexou: boolean;
  /** Robô, site ou app do Ops Center que parece atender: "É isso" guarda o rascunho; "Não é" segue a conversa. */
  onAceitarSugestao: () => void; onRecusarSugestao: () => void; aviso: string;
  onVoltar: () => void; onIrParaRevisao: () => void; onTentarNovamente: () => void;
};

export function ConversaDaTriagem({ mensagens, parecer, pergunta, busy, erro, onResponder, onAnexar, onPararEnvio, anexou, onAceitarSugestao, onRecusarSugestao, aviso, onVoltar, onIrParaRevisao, onTentarNovamente }: Props) {
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null), seletor = useRef<HTMLInputElement>(null);
  const analisando = busy === "analisando";
  const opcoes = pergunta ? parecer?.questions[pergunta.indice]?.options ?? [] : [];
  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [mensagens.length]);
  function responder(valor: string) {
    if ((!valor.trim() && !anexou) || busy) return;
    onResponder(valor.trim()); setTexto("");
  }

  // Sem cartão próprio: fica dentro do cartão da barra de progresso (NovoChamado).
  return <div className="flex flex-col gap-4">
    <div>
      <h2 className="text-heading font-semibold text-fg">Conversa com a IA</h2>
      <p className="mt-1 text-ui text-fg-secondary">Responda o que a IA perguntar para o chamado chegar completo a quem vai atender.</p>
    </div>
    <div className="flex flex-col gap-4">
      <div role="log" aria-label="Conversa com a IA" aria-live="polite" className="-mx-1 flex max-h-[min(34rem,calc(100dvh-22rem))] min-h-40 flex-col gap-3 overflow-y-auto px-1 py-1">
        {mensagens.map(m => <Balao key={m.id} daIA={m.role !== "user"}>{m.body}</Balao>)}
        {busy === "Enviando arquivo…" && <Balao daIA={false}><span className="inline-flex items-center gap-2"><Digitando />Enviando arquivo <button type="button" onClick={onPararEnvio} className="underline">parar</button></span></Balao>}
        {parecer?.existente && !analisando && <CartaoDoExistente e={parecer.existente} busy={!!busy} onAceitar={onAceitarSugestao} onRecusar={onRecusarSugestao} />}
        {aviso && <p role="status" className="pl-1 text-helper text-fg-secondary">{aviso}</p>}
        {opcoes.length > 0 && !analisando && <div role="group" aria-label="Respostas sugeridas" className="flex flex-wrap gap-2 pl-1">
          {opcoes.map(o => <button key={o} type="button" disabled={!!busy} onClick={() => responder(o)}
            className="rounded-full border border-brand/40 bg-surface px-3.5 py-1.5 text-ui font-medium text-brand transition-colors hover:bg-brand/8 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50">{o}</button>)}
        </div>}
        <div ref={fim} />
      </div>
      {/* Sem <form>: a conversa fica dentro do formulário da página, e Enter já envia. */}
      {pergunta && <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="resposta-da-revisao">{pergunta.total > 1 ? `Sua resposta, pergunta ${pergunta.indice + 1} de ${pergunta.total}` : "Sua resposta"}</label>
        {/* Enter envia, como num app de conversa; Shift+Enter quebra a linha. */}
        <Textarea id="resposta-da-revisao" rows={1} maxLength={10000} disabled={!!busy} value={texto} onChange={e => setTexto(e.target.value)}
          placeholder={opcoes.length ? "Escolha uma opção ou escreva" : "Escreva sua resposta"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); responder(texto); } }}
          className="field-sizing-content max-h-32 min-h-12! flex-1 rounded-2xl" />
        <input ref={seletor} type="file" accept={FORMATOS} hidden aria-label="Anexar arquivo à conversa" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onAnexar(file); }} />
        <Button type="button" variant="secondary" size="icon" className="size-12! shrink-0 rounded-2xl!" disabled={!!busy} aria-label="Anexar arquivo" title="Anexar arquivo (até 10 MB)" onClick={() => seletor.current?.click()}><Paperclip size={18} /></Button>
        <Button size="icon" className="size-12! shrink-0 rounded-2xl!" disabled={!!busy || (!texto.trim() && !anexou)} aria-label="Enviar resposta" onClick={() => responder(texto)}><SendHorizontal size={18} /></Button>
      </div>}
      {erro && <p role="alert" className="text-ui text-danger">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button variant="ghost" disabled={!!busy} onClick={onVoltar}><ArrowLeft size={14} /> Voltar ao pedido</Button>
        <div className="flex flex-wrap items-center gap-2">
          {pergunta && pergunta.total > 1 && <span className="text-helper text-fg-muted">Pergunta {pergunta.indice + 1} de {pergunta.total}</span>}
          {parecer?.status === "unavailable" && <Button variant="ghost" disabled={!!busy} onClick={onTentarNovamente}>Tentar análise novamente</Button>}
          <Button variant="secondary" disabled={!!busy} onClick={onIrParaRevisao}>Ir para a revisão</Button>
        </div>
      </div>
    </div>
  </div>;
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

const ICONES = { robo: Bot, site: Globe, app: AppWindow };
function CartaoDoExistente({ e, busy, onAceitar, onRecusar }: { e: Existente; busy: boolean; onAceitar: () => void; onRecusar: () => void }) {
  const Icone = ICONES[e.tipo], primeiroNome = e.responsavel?.trim().split(/\s+/)[0];
  // Texto pronto para quem pediu confirmar com o responsável, sem precisar do Ops Center.
  const mensagem = `Oi, ${primeiroNome}! Tudo bem? Ia abrir um chamado e vi que já existe o ${ROTULOS_EXISTENTE[e.tipo]} "${e.nome}", que fica com você. Ele atende ao que eu preciso? Se sim, como faço para usar?`;
  const [copiado, setCopiado] = useState(false);
  function copiar() { navigator.clipboard.writeText(mensagem).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }, () => {}); }
  return <div className="c41-surgir max-w-[85%] rounded-2xl rounded-tl-md border border-brand/30 bg-surface p-4 shadow-xs">
    <p className="mb-3 text-helper font-medium text-brand">{e.match === "same" ? "Já existe no Ops Center" : "Pode ser parecido, no Ops Center"}</p>
    <div className="flex items-start gap-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand"><Icone size={20} /></span>
      <div className="min-w-0">
        <p className="break-words font-semibold text-fg">{e.nome}</p>
        <p className="text-helper text-fg-muted">{ROTULOS_EXISTENTE[e.tipo][0].toLocaleUpperCase("pt-BR") + ROTULOS_EXISTENTE[e.tipo].slice(1)}{e.detalhe ? `, ${e.detalhe}` : ""}</p>
        <p className="mt-2 text-ui text-fg-secondary">Responsável: <strong className="text-fg">{e.responsavel ?? "sem responsável definido"}</strong></p>
        {e.endereco && <div className="mt-2 text-helper"><a href={e.endereco} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><ExternalLink size={12} />Abrir {ROTULOS_EXISTENTE[e.tipo]}</a></div>}
      </div>
    </div>
    {e.responsavel && <div className="mt-4 rounded-lg bg-surface-hover p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-helper font-medium text-fg-secondary">Mensagem para {primeiroNome}</p>
        <Button size="sm" variant="ghost" onClick={copiar}>{copiado ? <Check size={14} /> : <Copy size={14} />}{copiado ? "Copiada" : "Copiar"}</Button>
      </div>
      <p className="whitespace-pre-line break-words text-ui text-fg">{mensagem}</p>
    </div>}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={onAceitar}>{primeiroNome ? `É isso, vou falar com ${primeiroNome}` : "É isso"}</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onRecusar}>Não é o que preciso</Button>
    </div>
  </div>;
}
