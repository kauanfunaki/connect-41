"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, History, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { formatInstantDateTime } from "@/lib/format";
import type { AgenteDoChat } from "@/lib/ia/chat/agentes";
import type { ConversaNaLista, MensagemNaTela } from "@/lib/ia/chat/conversas";
import { descreverProposta } from "@/lib/ia/chat/regras";
import {
  abrirConversaDoChat,
  apagarConversaDoChat,
  aplicarPropostaDoChat,
  conversasDoChat,
} from "@/app/(app)/ia/chat-actions";

type Evento =
  | { tipo: "conversa"; id: string }
  | { tipo: "passo"; texto: string }
  | { tipo: "mensagem"; mensagem: MensagemNaTela }
  | { tipo: "erro"; texto: string };

/** Negrito com **, e uma linha por parágrafo. O resto vai como texto — nada de HTML vindo do modelo. */
function TextoDaResposta({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-1">
      {texto.split("\n").map((linha, i) => {
        if (!linha.trim()) return null;
        const item = /^\s*[-•]\s+/.test(linha);
        const partes = linha.replace(/^\s*[-•]\s+/, "").split(/(\*\*[^*]+\*\*)/g);
        const conteudo = partes.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <Fragment key={j}>{p.replace(/^#+\s*/, "")}</Fragment>
        );
        return item ? (
          <p key={i} className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-fg-muted">
            {conteudo}
          </p>
        ) : (
          <p key={i}>{conteudo}</p>
        );
      })}
    </div>
  );
}

/**
 * O chat de IA do canto inferior direito, em todas as telas internas.
 *
 * Só aparece para quem tem ao menos um agente disponível (`agentes`, calculado
 * no servidor pelo layout). A pergunta vai pela rota `/api/ia/chat`, que
 * devolve o passo atual e depois a resposta; o resto (histórico, aplicar
 * proposta) são server actions.
 */
export function ChatDeIA({ agentes }: { agentes: AgenteDoChat[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [vendoHistorico, setVendoHistorico] = useState(false);
  // O agente escolhido; nulo = o padrão (o do setor ativo, primeiro da lista).
  // Derivado, e não copiado para o estado: trocar de setor muda o padrão sem
  // efeito nenhum.
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>([]);
  const [conversas, setConversas] = useState<ConversaNaLista[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [passo, setPasso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const agentePadrao = agentes[0]?.code ?? "";
  const agentCode = escolhido && agentes.some((a) => a.code === escolhido) ? escolhido : agentePadrao;

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, passo, aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  if (agentes.length === 0) return null;
  const agente = agentes.find((a) => a.code === agentCode) ?? agentes[0]!;

  function novaConversa() {
    setConversaId(null);
    setMensagens([]);
    setErro(null);
    setVendoHistorico(false);
    setEscolhido(null);
  }

  async function verHistorico() {
    setVendoHistorico(true);
    setConversas(await conversasDoChat());
  }

  async function abrir(id: string) {
    const r = await abrirConversaDoChat(id);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    setConversaId(id);
    setEscolhido(r.agentCode);
    setMensagens(r.mensagens);
    setErro(null);
    setVendoHistorico(false);
  }

  async function apagar(id: string) {
    await apagarConversaDoChat(id);
    setConversas((cs) => cs.filter((c) => c.id !== id));
    if (id === conversaId) novaConversa();
  }

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    setPasso("Pensando…");
    setPergunta("");
    try {
      const res = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId, agentCode, pergunta: t, caminho: pathname }),
      });
      if (!res.body) throw new Error("Sem resposta do servidor.");
      const leitor = res.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const e = JSON.parse(linha) as Evento;
          if (e.tipo === "conversa") setConversaId(e.id);
          else if (e.tipo === "passo") setPasso(e.texto);
          else if (e.tipo === "mensagem") {
            setMensagens((ms) => [...ms, e.mensagem]);
            if (e.mensagem.papel === "usuario") setPasso("Pensando…");
          } else if (e.tipo === "erro") {
            setErro(e.texto);
            if (!res.ok) setPergunta(t);
          }
        }
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao falar com a IA.");
      setPergunta(t);
    } finally {
      setPasso(null);
      setEnviando(false);
    }
  }

  async function aplicar(m: MensagemNaTela, indice: number) {
    setAplicando(`${m.id}:${indice}`);
    const r = await aplicarPropostaDoChat(m.id, indice);
    setAplicando(null);
    if ("error" in r) {
      setErro(r.error);
      return;
    }
    setMensagens((ms) =>
      ms.map((x) => (x.id === m.id ? { ...x, propostas: x.propostas.map((p, i) => (i === indice ? { ...p, aplicada: true } : p)) } : x))
    );
    // A tela de trás mudou (a etapa foi concluída): recarrega o que ela mostra.
    router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full bg-brand text-on-brand shadow-[var(--c41-shadow-lg)] flex items-center justify-center hover:bg-brand-hover transition-colors"
        aria-label="Abrir o chat de IA"
        title="Perguntar à IA"
      >
        <Sparkles size={20} />
      </button>
    );
  }

  return (
    <section
      className="fixed z-40 inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[400px] sm:h-[min(620px,calc(100vh-2rem))] flex flex-col bg-surface-elevated border border-border sm:rounded-xl shadow-[var(--c41-shadow-lg)] overflow-hidden"
      aria-label="Chat de IA"
    >
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        {vendoHistorico ? (
          <button type="button" onClick={() => setVendoHistorico(false)} className="p-1 text-fg-muted hover:text-fg" aria-label="Voltar">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Sparkles size={16} className="text-brand shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {vendoHistorico ? (
            <p className="text-[14px] font-semibold text-fg">Conversas</p>
          ) : agentes.length > 1 && !conversaId ? (
            <Select compact value={agentCode} onChange={(e) => setEscolhido(e.target.value)} aria-label="Com qual IA conversar">
              {agentes.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.titulo}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-[14px] font-semibold text-fg truncate">{agente.titulo}</p>
          )}
        </div>
        {!vendoHistorico && (
          <button type="button" onClick={verHistorico} className="p-1 text-fg-muted hover:text-fg" aria-label="Conversas anteriores" title="Conversas anteriores">
            <History size={16} />
          </button>
        )}
        <button type="button" onClick={novaConversa} className="p-1 text-fg-muted hover:text-fg" aria-label="Nova conversa" title="Nova conversa">
          <Plus size={16} />
        </button>
        <button type="button" onClick={() => setAberto(false)} className="p-1 text-fg-muted hover:text-fg" aria-label="Fechar o chat">
          <X size={16} />
        </button>
      </header>

      {vendoHistorico ? (
        <div className="flex-1 overflow-y-auto p-2">
          {conversas.length === 0 ? (
            <p className="p-3 text-[13px] text-fg-muted">Nenhuma conversa ainda. Elas ficam guardadas por 90 dias.</p>
          ) : (
            <ul className="flex flex-col">
              {conversas.map((c) => (
                <li key={c.id} className="flex items-center gap-1 rounded-md hover:bg-surface-hover">
                  <button type="button" onClick={() => abrir(c.id)} className="flex-1 min-w-0 text-left px-2.5 py-2">
                    <span className="block text-[13px] text-fg truncate">{c.titulo}</span>
                    <span className="block text-[11px] text-fg-muted">
                      {agentes.find((a) => a.code === c.agentCode)?.titulo ?? "IA"} ·{" "}
                      {formatInstantDateTime(new Date(c.atualizadaEm), { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </button>
                  <button type="button" onClick={() => apagar(c.id)} className="p-2 text-fg-muted hover:text-danger" aria-label="Apagar conversa" title="Apagar">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
            {mensagens.length === 0 && !enviando && (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-fg-secondary">
                  Pergunte o que precisar. A IA consulta o Connect com o mesmo acesso que você tem e{" "}
                  <strong>não altera nada sozinha</strong> — sugestão só vale depois do seu “Aplicar”.
                </p>
                <div className="flex flex-col gap-1.5">
                  {agente.sugestoes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="text-left text-[13px] text-brand border border-border rounded-md px-3 py-2 hover:bg-surface-hover"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensagens.map((m) =>
              m.papel === "usuario" ? (
                <div key={m.id} className="self-end max-w-[85%] flex flex-col items-end gap-0.5">
                  <p className="rounded-lg bg-brand/10 border border-brand/20 px-3 py-2 text-[13px] text-fg whitespace-pre-wrap break-words">{m.texto}</p>
                  {m.contexto && <span className="text-[10px] text-fg-muted truncate max-w-full">{m.contexto}</span>}
                </div>
              ) : (
                <div key={m.id} className="self-start max-w-[95%] flex flex-col gap-2">
                  <div
                    className={`rounded-lg border px-3 py-2 text-[13px] break-words ${
                      m.falhou ? "border-danger/30 bg-danger/5 text-danger" : "border-border bg-surface text-fg"
                    }`}
                  >
                    <TextoDaResposta texto={m.texto} />
                  </div>
                  {m.truncada && (
                    <p className="flex items-start gap-1.5 text-[11px] text-warning">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> A IA parou antes de terminar — a resposta pode estar incompleta.
                    </p>
                  )}
                  {m.propostas.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-fg-muted">Sugestões — nada foi feito ainda</p>
                      {m.propostas.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 border border-border rounded-md px-2.5 py-1.5">
                          <span className="text-[12px] text-fg">{descreverProposta(p)}</span>
                          {p.aplicada ? (
                            <span className="text-[11px] text-success shrink-0">aplicado</span>
                          ) : (
                            <Button size="xs" variant="secondary" disabled={aplicando === `${m.id}:${i}`} onClick={() => aplicar(m, i)}>
                              {aplicando === `${m.id}:${i}` ? "Aplicando…" : "Aplicar"}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {passo && (
              <p className="self-start text-[12px] text-fg-muted flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-brand animate-pulse" aria-hidden />
                {passo}
              </p>
            )}
            {erro && <p className="text-[12px] text-danger">{erro}</p>}
            <div ref={fimRef} />
          </div>

          <form
            className="border-t border-border p-2 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(pergunta);
            }}
          >
            <Textarea
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(pergunta);
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Pergunte à IA…  (Enter envia, Shift+Enter quebra linha)"
              className="flex-1 resize-none text-[13px]"
              aria-label="Pergunta"
              disabled={enviando}
            />
            <Button type="submit" size="sm" disabled={enviando || !pergunta.trim()} aria-label="Enviar">
              <Send size={14} />
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
