"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, FilePlus2, Plus, X } from "lucide-react";
import { Ceci, type EstadoDaCeci } from "@/components/ia/Ceci";
import { RespostaDaCeci } from "@/components/ia/RespostaDaCeci";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Textarea } from "@/components/ui/Textarea";
import type { BotaoDaResposta, EventoDoPortal, SolicitacaoPreparada } from "@/lib/ia/portal/responder";

/** Uma troca na tela. Só o texto vai de volta ao servidor, como histórico. */
type Mensagem =
  | { papel: "usuario"; texto: string }
  | { papel: "assistente"; texto: string; botoes: BotaoDaResposta[]; solicitacao: SolicitacaoPreparada | null; truncada: boolean };

const GUARDA = "c41-ceci-portal";
const SUGESTOES = ["O que vence esta semana?", "Tenho alguma pendência?", "Como estão os meus processos?"];

/** A conversa desta aba, para sobreviver à troca de tela. Sem armazenamento, começa vazia. */
function lerGuardadas(): Mensagem[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(GUARDA) ?? "[]");
    return Array.isArray(v) ? (v as Mensagem[]) : [];
  } catch {
    return [];
  }
}

function guardar(ms: Mensagem[]) {
  try {
    sessionStorage.setItem(GUARDA, JSON.stringify(ms.slice(-20)));
  } catch {
    /* sem armazenamento: só não guarda */
  }
}

/**
 * A Ceci no portal do cliente (21/10/2026, fase 3): o botão no canto e o chat.
 *
 * Só aparece quando o layout confere que o escritório ligou a Ceci para
 * alguma empresa do acesso (`ceciNoPortalDaConta`). A conversa fica nesta aba
 * (`sessionStorage`), e as últimas trocas vão junto com a pergunta — o
 * servidor corta e limpa (`lerHistorico`). A resposta vem em NDJSON, como no
 * chat da equipe, para o passo ("Consultando as contas…") aparecer.
 *
 * A Ceci só consulta. Quando ela prepara uma solicitação, o cartão leva à tela
 * de nova solicitação já preenchida, e quem envia é o cliente.
 */
export function CeciDoPortal({ primeiroNome }: { primeiroNome: string | null }) {
  const [aberto, setAberto] = useState(false);
  // A conversa guardada entra já no primeiro desenho: fechado, o chat não a
  // mostra, então servidor (sem armazenamento) e navegador desenham igual.
  const [mensagens, setMensagens] = useState<Mensagem[]>(lerGuardadas);
  const [texto, setTexto] = useState("");
  const [passo, setPasso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, passo, aberto]);
  useEffect(() => {
    if (aberto) campoRef.current?.focus();
  }, [aberto]);

  const estado: EstadoDaCeci = enviando ? "pensando" : erro ? "naoConsegui" : "parada";

  function atualizar(ms: Mensagem[]) {
    setMensagens(ms);
    guardar(ms);
  }

  async function perguntar(pergunta: string) {
    const t = pergunta.trim();
    if (!t || enviando) return;
    const antes = mensagens;
    const comPergunta: Mensagem[] = [...antes, { papel: "usuario", texto: t }];
    atualizar(comPergunta);
    setTexto("");
    setErro(null);
    setEnviando(true);
    setPasso("Pensando…");
    try {
      const res = await fetch("/portal/ceci", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pergunta: t,
          historico: antes.map((m) => ({ papel: m.papel, texto: m.texto })),
          jaCumprimentada: antes.length > 0,
        }),
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
          const e = JSON.parse(linha) as EventoDoPortal;
          if (e.tipo === "passo") setPasso(e.texto);
          else if (e.tipo === "resposta") {
            atualizar([...comPergunta, { papel: "assistente", texto: e.texto, botoes: e.botoes, solicitacao: e.solicitacao, truncada: e.truncada }]);
          } else if (e.tipo === "erro") {
            setErro(e.texto);
            // Recusada antes de responder: a pergunta volta para o campo.
            if (!res.ok) {
              atualizar(antes);
              setTexto(t);
            }
          }
        }
      }
    } catch {
      setErro("Não deu para falar com a Ceci agora. Tente de novo.");
      atualizar(antes);
      setTexto(t);
    } finally {
      setPasso(null);
      setEnviando(false);
    }
  }

  function novaConversa() {
    atualizar([]);
    setErro(null);
    campoRef.current?.focus();
  }

  if (!aberto) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Falar com a Ceci, assistente do portal"
          data-dica="Ceci · Portal do cliente"
          className="relative flex size-12 sm:size-14 rounded-full outline-none transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
        >
          <Ceci tamanho={56} estado={estado} className="c41-ceci-flutuante size-full" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
      <section
        className="fixed z-40 inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[400px] sm:h-[min(720px,calc(100dvh-2rem))] flex flex-col bg-surface-elevated sm:border sm:border-border sm:rounded-lg shadow-lg overflow-hidden"
        aria-label="Chat com a Ceci"
      >
        <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Ceci tamanho={32} estado={estado} />
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-label font-semibold text-fg truncate">Ceci</p>
            <p className="text-micro text-fg-muted truncate">Assistente do portal</p>
          </div>
          <IconButton size="sm" onClick={novaConversa} title="Nova conversa" disabled={enviando}>
            <Plus size={16} />
          </IconButton>
          <IconButton size="sm" onClick={() => setAberto(false)} title="Fechar o chat">
            <X size={16} />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-4 text-ui text-fg-secondary">
          {mensagens.length === 0 && (
            <div className="flex items-start gap-2.5">
              <Ceci tamanho={24} className="mt-0.5" />
              <div className="flex flex-col gap-2">
                <p>
                  {primeiroNome ? `Oi, ${primeiroNome}! ` : "Oi! "}Sou a Ceci, a assistente do escritório. Consulto para você as
                  pendências, as contas, os processos, as notas e as solicitações das suas empresas.
                </p>
                <p className="text-fs-2 text-fg-muted">
                  Sou uma inteligência artificial e posso errar: confira na tela. Eu só consulto — quando você precisar da equipe,
                  preparo uma solicitação para você revisar e enviar.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void perguntar(s)}
                      className="inline-flex items-center gap-1.5 max-w-full text-left text-fs-2 text-fg-secondary border border-border rounded-full px-3 py-1.5 hover:border-brand hover:text-brand transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mensagens.map((m, i) =>
            m.papel === "usuario" ? (
              <p key={i} className="self-end max-w-[85%] whitespace-pre-wrap rounded-lg bg-brand-subtle px-3 py-2 text-fg">
                {m.texto}
              </p>
            ) : (
              <div key={i} className="flex items-start gap-2.5">
                <Ceci tamanho={24} className="mt-0.5" />
                <div className="min-w-0 flex-1 flex flex-col gap-2">
                  <RespostaDaCeci texto={m.texto} semLinks />
                  {m.truncada && <p className="text-fs-2 text-fg-muted">A resposta ficou incompleta. Tente perguntar de um jeito mais direto.</p>}
                  {m.botoes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.botoes.map((b) => (
                        <Button
                          key={b.href}
                          href={b.href}
                          prefetch={false}
                          variant="secondary"
                          size="xs"
                          onClick={() => setAberto(false)}
                          className="h-auto! min-h-7 max-w-full py-1 text-left whitespace-normal text-brand"
                        >
                          <span className="min-w-0">{b.rotulo}</span>
                          <ArrowRight size={13} aria-hidden className="flex-shrink-0" />
                        </Button>
                      ))}
                    </div>
                  )}
                  {m.solicitacao && <CartaoDaSolicitacao s={m.solicitacao} aoAbrir={() => setAberto(false)} />}
                </div>
              </div>
            )
          )}

          {passo && (
            <p role="status" className="flex items-center gap-2 text-fs-2 text-fg-muted">
              <Ceci tamanho={20} estado="pensando" />
              {passo}
            </p>
          )}
          {erro && (
            <p role="alert" className="text-fs-2 text-danger">
              {erro}
            </p>
          )}
          <div ref={fimRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t border-border px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void perguntar(texto);
          }}
        >
          <Textarea
            ref={campoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void perguntar(texto);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Pergunte sobre as suas empresas…"
            aria-label="Sua pergunta para a Ceci"
            className="min-h-9! max-h-32 flex-1 resize-none overflow-y-auto"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            aria-label="Enviar a pergunta"
            className="mb-0.5 size-8 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-brand-solid text-on-brand hover:bg-brand-solid-hover disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp size={16} />
          </button>
        </form>
      </section>
    </>
  );
}

/** A solicitação que a Ceci preparou: nada foi enviado — o cliente revisa e envia na tela. */
function CartaoDaSolicitacao({ s, aoAbrir }: { s: SolicitacaoPreparada; aoAbrir: () => void }) {
  return (
    <div className="rounded-lg border border-brand/40 bg-brand-subtle/40 px-3 py-2.5 flex flex-col gap-1.5">
      <p className="text-fs-2 font-semibold text-fg">Solicitação preparada — ainda não enviada</p>
      <p className="text-fs-2 text-fg-secondary">
        {s.assunto} · {s.empresaNome}
      </p>
      <p className="text-fs-2 text-fg-secondary line-clamp-3 whitespace-pre-wrap">{s.descricao}</p>
      <Button href={s.href} prefetch={false} size="xs" onClick={aoAbrir} className="self-start">
        <FilePlus2 size={13} aria-hidden /> Revisar e enviar
      </Button>
    </div>
  );
}
