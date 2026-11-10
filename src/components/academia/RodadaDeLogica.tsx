"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { enviarLogicaAction } from "@/app/(app)/academia/actions";
import { ROTULO_DO_NIVEL, TEMPO_DA_LOGICA_S } from "@/lib/academia/regras";
import { letraDaAlternativa } from "@/lib/academia/logica";
import type { ResultadoDoEnvio, RodadaServida } from "@/lib/academia/tipos";

type Rodada = Extract<RodadaServida, { teste: "logica" }>;

const MARCOS = new Set([120, 60, 30, 10]);
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * A rodada de lógica (10/11/2026, pedido do Kauan): uma questão por vez, com
 * a imagem do enunciado e, quando houver, a de cada alternativa. 3 minutos
 * desde que as questões aparecem (como no Hub); no fim do tempo, envia o que
 * estiver marcado. A alternativa certa nunca vem para a tela.
 */
export function RodadaDeLogica({ rodada, onFim }: { rodada: Rodada; onFim: (r: ResultadoDoEnvio) => void }) {
  const total = rodada.questoes.length;
  const [atual, setAtual] = useState(0);
  const [respostas, setRespostas] = useState<(number | null)[]>(() => rodada.questoes.map(() => null));
  const [restante, setRestante] = useState(TEMPO_DA_LOGICA_S);
  const [anuncio, setAnuncio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const respostasRef = useRef(respostas);
  const enviado = useRef(false);
  const comeco = useRef<number | null>(null);
  const id = useId();

  const enviar = useCallback(async () => {
    if (enviado.current) return;
    enviado.current = true;
    setEnviando(true);
    const duracaoMs = comeco.current === null ? 0 : Math.round(performance.now() - comeco.current);
    try {
      onFim(await enviarLogicaAction({ sessaoId: rodada.sessaoId, nonce: rodada.nonce, respostas: respostasRef.current, duracaoMs }));
    } catch {
      onFim({ ok: false, erro: "Não foi possível enviar as respostas. Confira a conexão e tente outra rodada." });
    }
  }, [onFim, rodada.nonce, rodada.sessaoId]);

  // O relógio começa quando as questões aparecem.
  useEffect(() => {
    const inicio = performance.now();
    comeco.current = inicio;
    let anunciado = TEMPO_DA_LOGICA_S;
    const intervalo = setInterval(() => {
      const falta = Math.max(0, TEMPO_DA_LOGICA_S - Math.floor((performance.now() - inicio) / 1000));
      setRestante(falta);
      if (falta !== anunciado && MARCOS.has(falta)) {
        anunciado = falta;
        setAnuncio(falta >= 60 ? `Faltam ${falta / 60} minuto${falta === 60 ? "" : "s"}.` : `Faltam ${falta} segundos.`);
      }
      if (falta <= 0) {
        clearInterval(intervalo);
        setAnuncio("Tempo esgotado. Enviando as respostas.");
        void enviar();
      }
    }, 250);
    return () => clearInterval(intervalo);
  }, [enviar]);

  function responder(i: number, alternativa: number) {
    // A cópia no ref é a que o envio do fim do tempo lê (o relógio não re-renderiza a função).
    const nova = respostasRef.current.map((x, j) => (j === i ? alternativa : x));
    respostasRef.current = nova;
    setRespostas(nova);
  }

  const q = rodada.questoes[atual];
  const respondidas = respostas.filter((r) => r !== null).length;
  const nomeDoGrupo = `${id}-q${atual}`;

  return (
    <section aria-label={`Lógica, nível ${ROTULO_DO_NIVEL[rodada.nivel]}`} className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="timer"
            aria-label={`Tempo restante: ${restante} segundos`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-ui font-semibold tabular-nums ${
              restante <= 30 ? "border-danger/30 bg-danger/8 text-danger" : "border-border bg-surface text-fg"
            }`}
          >
            <Clock size={14} aria-hidden /> {relogio(restante)}
          </span>
          <Selo tom="neutro" className="tabular-nums">
            {respondidas} de {total} respondidas
          </Selo>
          <Selo tom={rodada.valendo ? "marca" : "neutro"}>{rodada.valendo ? "Valendo" : "Treino livre"} · {ROTULO_DO_NIVEL[rodada.nivel]}</Selo>
        </div>
        <Button size="sm" onClick={() => void enviar()} disabled={enviando} className="min-h-11 sm:min-h-0">
          <Send size={13} aria-hidden /> {enviando ? "Enviando…" : "Enviar respostas"}
        </Button>
      </div>

      {/* As questões numeradas: pular para qualquer uma, e ver quais faltam. */}
      <nav aria-label="Questões" className="flex flex-wrap gap-1.5">
        {rodada.questoes.map((qq, i) => (
          <button
            key={qq.id}
            type="button"
            onClick={() => setAtual(i)}
            aria-current={i === atual ? "step" : undefined}
            aria-label={`Questão ${i + 1}${respostas[i] !== null ? ", respondida" : ""}`}
            className={`inline-flex size-11 items-center justify-center rounded-md border text-ui font-semibold tabular-nums sm:size-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              i === atual ? "border-brand bg-brand-subtle text-brand" : respostas[i] !== null ? "border-border-strong bg-surface-2 text-fg" : "border-border bg-surface text-fg-muted"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" disabled={enviando}>
        <legend className="sr-only">
          Questão {atual + 1} de {total}
        </legend>
        <p className="text-helper font-medium text-fg-muted" aria-hidden>
          Questão {atual + 1} de {total}
        </p>
        <p className="whitespace-pre-wrap text-body text-fg">{q.enunciado}</p>
        {q.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- imagem privada, servida pela rota da Academia com a sessão
          <img src={q.imagemUrl} alt={`Imagem da questão ${atual + 1}`} className="max-h-[360px] w-auto max-w-full self-start rounded-md border border-border object-contain" />
        )}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Alternativas da questão ${atual + 1}`}>
          {q.alternativas.map((a, i) => {
            const marcada = respostas[atual] === i;
            const idDaOpcao = `${nomeDoGrupo}-${i}`;
            return (
              <label
                key={i}
                htmlFor={idDaOpcao}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                  marcada ? "border-brand bg-brand-subtle" : "border-border hover:bg-surface-hover"
                }`}
              >
                <input id={idDaOpcao} type="radio" name={nomeDoGrupo} className="sr-only" checked={marcada} onChange={() => responder(atual, i)} />
                <span aria-hidden className={`inline-flex size-6 flex-shrink-0 items-center justify-center rounded-full border text-helper font-semibold ${marcada ? "border-brand bg-brand text-on-brand" : "border-border-strong text-fg-secondary"}`}>
                  {letraDaAlternativa(i)}
                </span>
                <span className="flex min-w-0 flex-col gap-2 text-ui text-fg">
                  <span className="sr-only">Alternativa {letraDaAlternativa(i)}: </span>
                  {a.texto && <span>{a.texto}</span>}
                  {a.imagemUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- imagem privada, servida pela rota da Academia com a sessão
                    <img src={a.imagemUrl} alt={a.texto ? "" : `Imagem da alternativa ${letraDaAlternativa(i)}`} className="max-h-40 w-auto max-w-full rounded-md border border-border object-contain" />
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={() => setAtual((a) => Math.max(0, a - 1))} disabled={atual === 0} className="min-h-11 sm:min-h-0">
          <ChevronLeft size={14} aria-hidden /> Anterior
        </Button>
        {atual < total - 1 ? (
          <Button variant="secondary" onClick={() => setAtual((a) => Math.min(total - 1, a + 1))} className="min-h-11 sm:min-h-0">
            Próxima <ChevronRight size={14} aria-hidden />
          </Button>
        ) : (
          <Button onClick={() => void enviar()} disabled={enviando} className="min-h-11 sm:min-h-0">
            <Send size={13} aria-hidden /> Enviar respostas
          </Button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
    </section>
  );
}
