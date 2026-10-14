"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Check, Eye, Pause, Play, X } from "lucide-react";
import { Ceci } from "@/components/ia/Ceci";
import { CONVERSAS_DA_CECI, type ConversaDaCeci } from "./conversasDaCeci";

// A Ceci por setor (13/10/2026, versão 3 do site): à esquerda a lista dos
// setores, à direita uma conversa de exemplo naquele setor. Os textos ficam em
// `conversasDaCeci` — só o que cada agente faz de verdade.
//
// É um conjunto de abas (tablist/tab/tabpanel, com as setas do teclado). Troca
// sozinho, devagar, e para de vez quando a pessoa escolhe um setor, pelo
// clique ou pelo teclado. Também segura enquanto o mouse está em cima, o foco
// está nas abas ou a seção está fora da tela, e o botão "Pausar a troca" para
// e retoma (troca automática pede um jeito de parar — WCAG 2.2.2). Com
// "reduzir movimento" no aparelho, não troca nunca.
//
// O relógio da troca é a linha no alto do painel (`.c41-site-progresso`, em
// globals.css): quando a animação dela termina, entra o próximo setor. Pausar
// a troca é pausar a animação — sem setTimeout para sincronizar com ela.
//
// Todos os painéis ficam montados, um em cima do outro na mesma célula da
// grade: a altura é a do maior, e a troca não empurra a página. Os de fora
// ficam `invisible`, fora da tela e do leitor de tela.

const DURACAO_MS = 8000;
const MENOS_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function useMenosMovimento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia(MENOS_MOVIMENTO);
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia(MENOS_MOVIMENTO).matches,
    // No servidor não dá para saber: vale como "menos movimento", e nada anda
    // até o navegador responder. A lista chega parada no primeiro setor.
    () => true
  );
}

export function CeciNosSetores() {
  const n = CONVERSAS_DA_CECI.length;
  const [ativo, setAtivo] = useState(0);
  // A pessoa escolheu um setor ou apertou "Pausar": a troca para até ela
  // apertar "Retomar".
  const [parado, setParado] = useState(false);
  const [mouseEmCima, setMouseEmCima] = useState(false);
  const [focoNasAbas, setFocoNasAbas] = useState(false);
  const [visivel, setVisivel] = useState(false);
  const menosMovimento = useMenosMovimento();
  const raiz = useRef<HTMLDivElement>(null);
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => setVisivel(Boolean(e?.isIntersecting)), { threshold: 0.3 });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const anda = !menosMovimento && !parado;
  const tocando = anda && visivel && !mouseEmCima && !focoNasAbas;

  function escolher(i: number, focar = false) {
    setParado(true);
    setAtivo(i);
    if (focar) abas.current[i]?.focus();
  }

  function teclas(e: React.KeyboardEvent, i: number) {
    const destinos: Record<string, number> = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 };
    const destino = destinos[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    escolher((destino + n) % n, true);
  }

  return (
    <div ref={raiz} className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div className="flex flex-col">
        <div
          role="tablist"
          aria-label="Setores em que a Ceci atende"
          className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:gap-1.5"
          onMouseEnter={() => setMouseEmCima(true)}
          onMouseLeave={() => setMouseEmCima(false)}
          onFocus={() => setFocoNasAbas(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocoNasAbas(false);
          }}
        >
          {CONVERSAS_DA_CECI.map((c, i) => {
            const escolhido = i === ativo;
            return (
              <button
                key={c.chave}
                ref={(el) => {
                  abas.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-aba-${c.chave}`}
                aria-selected={escolhido}
                aria-controls={`${id}-painel-${c.chave}`}
                tabIndex={escolhido ? 0 : -1}
                onClick={() => escolher(i)}
                onKeyDown={(e) => teclas(e, i)}
                className={`group flex items-center gap-2.5 rounded-full px-3.5 py-2 text-left transition-colors lg:items-stretch lg:gap-4 lg:rounded-2xl lg:px-4 lg:py-3.5 ${
                  escolhido
                    ? "bg-white/[.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]"
                    : "text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] hover:bg-white/[.04] hover:text-white lg:shadow-none"
                }`}
              >
                {/* A cor do setor: bolinha no celular, fio na lista do computador. */}
                <span
                  aria-hidden
                  className={`size-2 flex-none rounded-full transition-opacity lg:h-auto lg:w-[3px] ${escolhido ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
                  style={{ background: c.cor }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-fs-4 font-medium leading-tight sm:text-fs-5 lg:text-fs-7">{c.setor}</span>
                    {c.emBreve && (
                      <span className="rounded-full border border-white/25 px-2 py-px font-mono text-fs-1 uppercase tracking-[0.1em] text-white/80">
                        Em breve
                      </span>
                    )}
                  </span>
                  <span className={`hidden text-fs-4 leading-snug lg:block ${escolhido ? "text-white/75" : "text-white/55"}`}>{c.resumo}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Pausar e retomar. Sem movimento liberado (e no servidor), o botão
            some mas guarda o lugar, para nada pular quando ele aparece. */}
        <div className="mt-4 flex lg:mt-5">
          <button
            type="button"
            onClick={() => setParado((p) => !p)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-fs-3 font-medium text-white/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors hover:text-white ${
              menosMovimento ? "invisible" : ""
            }`}
          >
            {parado ? <Play size={13} aria-hidden className="flex-none" /> : <Pause size={13} aria-hidden className="flex-none" />}
            {parado ? "Retomar a troca" : "Pausar a troca"}
          </button>
        </div>
      </div>

      <div className="grid" onMouseEnter={() => setMouseEmCima(true)} onMouseLeave={() => setMouseEmCima(false)}>
        {CONVERSAS_DA_CECI.map((c, i) => {
          const escolhido = i === ativo;
          return (
            <div
              key={c.chave}
              role="tabpanel"
              id={`${id}-painel-${c.chave}`}
              aria-labelledby={`${id}-aba-${c.chave}`}
              tabIndex={escolhido ? 0 : undefined}
              className={`[grid-area:1/1] rounded-[22px] ${escolhido ? "c41-site-troca visible" : "invisible"}`}
            >
              <Painel conversa={c}>
                {escolhido && anda && (
                  <span
                    key={ativo}
                    aria-hidden
                    className="c41-site-progresso absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: c.cor, "--duracao": `${DURACAO_MS}ms`, animationPlayState: tocando ? "running" : "paused" } as React.CSSProperties}
                    onAnimationEnd={() => setAtivo((ativo + 1) % n)}
                  />
                )}
              </Painel>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** O painel do chat, como o do canto da tela do Connect, com a conversa do setor. */
function Painel({ conversa: c, children }: { conversa: ConversaDaCeci; children: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] bg-surface-elevated text-fg shadow-[0_40px_90px_-30px_rgba(0,0,0,.65)] ring-1 ring-white/10">
      {children}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <Ceci tamanho={30} estado={c.emBreve ? "pensando" : "parada"} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-fs-4 font-semibold text-fg">Ceci</p>
          <p className="truncate text-fs-2 text-fg-muted">{c.setor}</p>
        </div>
        {!c.emBreve && (
          <span className="flex-none rounded-full border border-border px-2 py-0.5 font-mono text-fs-1 uppercase tracking-[0.1em] text-fg-muted">
            Exemplo
          </span>
        )}
      </div>

      {c.emBreve ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center sm:px-10">
          <Ceci tamanho={76} estado="pensando" />
          <p className="mt-2 font-display text-fs-8 font-medium leading-tight tracking-[-0.01em] text-fg">Em breve no Portal do Cliente</p>
          <p className="max-w-[30em] text-fs-4 leading-relaxed text-fg-secondary">{c.jeito}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-5 sm:py-6">
            {c.pergunta && (
              <p className="max-w-[85%] self-end rounded-lg rounded-br-sm bg-brand-solid px-3.5 py-2.5 text-fs-4 leading-snug text-on-brand">
                {c.pergunta}
              </p>
            )}
            {c.resposta && (
              <div className="flex items-start gap-2.5">
                <Ceci tamanho={24} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-fs-4 leading-relaxed text-fg">
                  <p>{c.resposta.texto}</p>
                  {c.resposta.itens && (
                    <ul className="flex flex-col gap-1">
                      {c.resposta.itens.map((item) => (
                        <li key={item} className="relative pl-3.5 before:absolute before:left-0.5 before:text-fg-muted before:content-['•']">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.resposta.fecho && <p>{c.resposta.fecho}</p>}
                  {c.link && (
                    <span className="inline-flex items-center gap-1 font-medium text-brand">
                      {c.link}
                      <ArrowUpRight size={14} aria-hidden className="flex-none" />
                    </span>
                  )}
                  {c.proposta && (
                    <div className="mt-1 flex flex-col gap-2">
                      <p className="c41-rotulo">Sugestões — nada foi feito ainda</p>
                      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
                        <p className="text-fs-4 text-fg">{c.proposta.texto}</p>
                        {/* Os botões do cartão do chat, só desenhados: no exemplo não há o que aplicar. */}
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-fs-2 font-semibold">
                          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-surface-elevated px-2.5 text-fg">
                            <X size={12} aria-hidden className="flex-none" />
                            {c.proposta.nao}
                          </span>
                          <span className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-solid px-2.5 text-on-brand">
                            <Check size={12} aria-hidden className="flex-none" />
                            {c.proposta.sim}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border bg-canvas px-4 py-4 dark:bg-surface sm:px-5">
            <p className="c41-rotulo">Neste setor, ela consulta</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {c.consulta.map((item) => (
                <li
                  key={item}
                  className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-fs-2 font-medium text-fg-secondary"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-fs-3 leading-snug text-fg-secondary">
              <Eye size={15} aria-hidden className="mt-px flex-none text-brand" />
              {c.jeito}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
