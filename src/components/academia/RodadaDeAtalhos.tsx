"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { enviarAtalhosAction } from "@/app/(app)/academia/actions";
import { ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TEMPO_DOS_ATALHOS_S } from "@/lib/academia/regras";
import { combinacaoDoEvento } from "@/lib/academia/atalhos";
import type { ResultadoDoEnvio, RodadaServida } from "@/lib/academia/tipos";

type Rodada = Extract<RodadaServida, { teste: "atalhos" }>;

const MARCOS = new Set([45, 30, 15, 10, 5]);
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * A rodada de atalhos (Fase 2, 11/11/2026): a tela pede uma ação e a pessoa
 * aperta o atalho. 60 s a partir do primeiro atalho. A tela não diz se acertou
 * na hora — a correção é do servidor e aparece no fim, com o atalho certo de
 * cada erro.
 *
 * As teclas são ouvidas na janela inteira, na fase de captura: assim o
 * Ctrl+K não abre a busca do Connect e o Esc não fecha nada durante a rodada.
 * O que o navegador deixa a página segurar (Ctrl+S, Ctrl+P, F5…) leva
 * `preventDefault`; o Tab continua andando até o "Finalizar".
 */
export function RodadaDeAtalhos({ rodada, onFim }: { rodada: Rodada; onFim: (r: ResultadoDoEnvio) => void }) {
  // `indice` é também quantos já foram respondidos.
  const [indice, setIndice] = useState(0);
  const [estado, setEstado] = useState<"pronto" | "rodando" | "enviando">("pronto");
  const [restante, setRestante] = useState(TEMPO_DOS_ATALHOS_S);
  const [ultima, setUltima] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const respostas = useRef<string[]>([]);
  const inicio = useRef<number | null>(null);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  const enviado = useRef(false);
  const rodando = useRef(false);

  const finalizar = useCallback(async () => {
    if (enviado.current) return;
    enviado.current = true;
    if (intervalo.current) clearInterval(intervalo.current);
    setEstado("enviando");
    const duracaoMs = inicio.current === null ? 0 : Math.round(performance.now() - inicio.current);
    try {
      onFim(await enviarAtalhosAction({ sessaoId: rodada.sessaoId, nonce: rodada.nonce, respostas: respostas.current, duracaoMs }));
    } catch {
      onFim({ ok: false, erro: "Não foi possível enviar o resultado. Confira a conexão e tente outra rodada." });
    }
  }, [onFim, rodada.nonce, rodada.sessaoId]);

  const comecarRelogio = useCallback(() => {
    rodando.current = true;
    inicio.current = performance.now();
    const comeco = inicio.current;
    setEstado("rodando");
    let anunciado = TEMPO_DOS_ATALHOS_S;
    intervalo.current = setInterval(() => {
      const falta = Math.max(0, TEMPO_DOS_ATALHOS_S - Math.floor((performance.now() - comeco) / 1000));
      setRestante(falta);
      if (falta !== anunciado && MARCOS.has(falta)) {
        anunciado = falta;
        setAnuncio(`Faltam ${falta} segundos.`);
      }
      if (falta <= 0) {
        setAnuncio("Tempo esgotado.");
        void finalizar();
      }
    }, 250);
  }, [finalizar]);

  useEffect(() => {
    function aoApertar(e: KeyboardEvent) {
      if (enviado.current) return;
      const combinacao = combinacaoDoEvento(e);
      if (!combinacao) return;
      // Durante a rodada, o atalho é resposta: nem o navegador nem o Connect agem.
      e.preventDefault();
      e.stopPropagation();
      if (!e.isTrusted || e.repeat) return;
      if (!rodando.current) comecarRelogio();
      respostas.current.push(combinacao);
      setUltima(combinacao);
      const proximo = respostas.current.length;
      if (proximo >= rodada.pedidos.length) {
        void finalizar();
        return;
      }
      setIndice(proximo);
      setAnuncio(`Próximo: ${rodada.pedidos[proximo].acao}.`);
    }
    window.addEventListener("keydown", aoApertar, { capture: true });
    return () => window.removeEventListener("keydown", aoApertar, { capture: true });
  }, [comecarRelogio, finalizar, rodada.pedidos]);

  useEffect(() => () => {
    if (intervalo.current) clearInterval(intervalo.current);
  }, []);

  const pedido = rodada.pedidos[indice];
  return (
    <section aria-label={`${ROTULO_DO_TESTE.atalhos}, nível ${ROTULO_DO_NIVEL[rodada.nivel]}`} className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="timer"
            aria-label={`Tempo restante: ${restante} segundos`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-ui font-semibold tabular-nums ${
              restante <= 10 && estado === "rodando" ? "border-danger/30 bg-danger/8 text-danger" : "border-border bg-surface text-fg"
            }`}
          >
            <Clock size={14} aria-hidden /> {relogio(restante)}
          </span>
          <Selo tom="neutro" className="tabular-nums">
            {indice} {indice === 1 ? "respondido" : "respondidos"}
          </Selo>
          <Selo tom={rodada.valendo ? "marca" : "neutro"}>
            {rodada.valendo ? "Valendo" : "Treino livre"} · {ROTULO_DO_NIVEL[rodada.nivel]}
          </Selo>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void finalizar()} disabled={estado !== "rodando"} className="min-h-11 sm:min-h-0">
          <Square size={13} aria-hidden /> Finalizar
        </Button>
      </div>

      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface p-6 text-center shadow-xs">
        {pedido && (
          <>
            <Selo tom="neutro">{pedido.onde === "Geral" ? "Em qualquer programa" : `No ${pedido.onde}`}</Selo>
            <p className="text-fs-8 font-semibold text-fg">
              {pedido.acao}
            </p>
          </>
        )}
        <p className="min-h-5 text-helper text-fg-muted tabular-nums">
          {estado === "enviando" ? "Conferindo o resultado…" : ultima ? `Você apertou ${ultima}` : "Aperte o atalho desta ação para começar."}
        </p>
      </div>

      <p className="text-helper text-fg-muted">
        O relógio começa no primeiro atalho. Cada atalho apertado passa para a próxima ação, certo ou errado — a correção aparece no fim, com o atalho certo de cada erro. Letras sozinhas não contam.
      </p>
      <p className="sr-only" aria-live="polite">
        {estado === "pronto" && pedido ? `Primeira ação: ${pedido.acao}.` : anuncio}
      </p>
    </section>
  );
}
