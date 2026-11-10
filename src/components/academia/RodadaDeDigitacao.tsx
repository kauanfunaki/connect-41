"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Clock, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { enviarDigitacaoAction } from "@/app/(app)/academia/actions";
import { ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TEMPO_DA_DIGITACAO_S } from "@/lib/academia/regras";
import type { TelemetriaDaDigitacao } from "@/lib/academia/digitacao";
import type { ResultadoDoEnvio, RodadaServida } from "@/lib/academia/tipos";

type Rodada = Extract<RodadaServida, { teste: "digitacao" | "numeros" }>;

/** Os segundos em que o leitor de tela avisa quanto falta (sem falar a cada segundo). */
const MARCOS = new Set([45, 30, 15, 10, 5]);

function mediaEDesvio(xs: number[]): { media: number; desvio: number } {
  if (xs.length === 0) return { media: 0, desvio: 0 };
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variancia = xs.reduce((a, b) => a + (b - media) ** 2, 0) / xs.length;
  return { media, desvio: Math.sqrt(variancia) };
}

const relogio = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * A rodada de digitação e de números (10/11/2026, pedido do Kauan), como no
 * 41 Hub: 60 s a partir da primeira tecla, colar e arrastar bloqueados, e a
 * telemetria que o servidor usa para descartar macro e script (salto de
 * caracteres, ritmo entre teclas, tempo de pressão, evento sintético). O que
 * vale é a conta do servidor; aqui só se mede e se mostra.
 *
 * Acessível: o texto vai inteiro para o leitor de tela (a cópia colorida é
 * só visual), o relógio é um `timer` e um aviso educado fala o tempo que
 * falta em alguns marcos. Sem animação para quem pediu menos movimento.
 */
export function RodadaDeDigitacao({ rodada, onFim }: { rodada: Rodada; onFim: (r: ResultadoDoEnvio) => void }) {
  const texto = rodada.texto;
  const [digitado, setDigitado] = useState("");
  const [estado, setEstado] = useState<"pronto" | "rodando" | "enviando">("pronto");
  const [restante, setRestante] = useState(TEMPO_DA_DIGITACAO_S);
  const [anuncio, setAnuncio] = useState("");
  const [aviso, setAviso] = useState("");
  const inicio = useRef<number | null>(null);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  const atual = useRef("");
  const enviado = useRef(false);
  const medida = useRef({
    colagens: 0, maiorSalto: 0, sintetico: false, tamanhoAnterior: 0, ultimaTecla: null as number | null,
    intervalos: [] as number[], descidas: new Map<string, number>(), pressoes: [] as number[],
  });
  const id = useId();
  const idDoTexto = `${id}-texto`;
  const idDaInstrucao = `${id}-instrucao`;

  const finalizar = useCallback(async () => {
    if (enviado.current) return;
    enviado.current = true;
    if (intervalo.current) clearInterval(intervalo.current);
    setEstado("enviando");
    const m = medida.current;
    const ritmo = mediaEDesvio(m.intervalos);
    const pressao = mediaEDesvio(m.pressoes);
    const telemetria: TelemetriaDaDigitacao = {
      colagens: m.colagens, maiorSalto: m.maiorSalto, sintetico: m.sintetico,
      teclas: m.intervalos.length, intervaloMedioMs: Math.round(ritmo.media), desvioDoIntervaloMs: Math.round(ritmo.desvio),
      pressoes: m.pressoes.length, pressaoMediaMs: Math.round(pressao.media), desvioDaPressaoMs: Math.round(pressao.desvio),
    };
    const duracaoMs = inicio.current === null ? 0 : Math.round(performance.now() - inicio.current);
    try {
      onFim(await enviarDigitacaoAction({ sessaoId: rodada.sessaoId, nonce: rodada.nonce, digitado: atual.current, duracaoMs, telemetria }));
    } catch {
      onFim({ ok: false, erro: "Não foi possível enviar o resultado. Confira a conexão e tente outra rodada." });
    }
  }, [onFim, rodada.nonce, rodada.sessaoId]);

  useEffect(() => () => {
    if (intervalo.current) clearInterval(intervalo.current);
  }, []);

  function comecarRelogio() {
    inicio.current = performance.now();
    const comeco = inicio.current;
    setEstado("rodando");
    let anunciado = TEMPO_DA_DIGITACAO_S;
    intervalo.current = setInterval(() => {
      const falta = Math.max(0, TEMPO_DA_DIGITACAO_S - Math.floor((performance.now() - comeco) / 1000));
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
  }

  function aoDigitar(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const m = medida.current;
    if (!e.nativeEvent.isTrusted) {
      m.sintetico = true;
      return;
    }
    if (estado === "enviando") return;
    const valor = e.target.value.slice(0, texto.length);
    if (estado === "pronto" && valor.length > 0) comecarRelogio();
    m.maiorSalto = Math.max(m.maiorSalto, Math.abs(valor.length - m.tamanhoAnterior));
    if (valor.length === m.tamanhoAnterior + 1) {
      const agora = performance.now();
      if (m.ultimaTecla !== null) m.intervalos.push(agora - m.ultimaTecla);
      m.ultimaTecla = agora;
    }
    m.tamanhoAnterior = valor.length;
    atual.current = valor;
    setDigitado(valor);
    if (valor.length >= texto.length) void finalizar();
  }

  function aoDescer(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const m = medida.current;
    if (!e.nativeEvent.isTrusted) {
      m.sintetico = true;
      return;
    }
    const tecla = e.code || e.key;
    if (!m.descidas.has(tecla)) m.descidas.set(tecla, performance.now());
  }

  function aoSubir(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const m = medida.current;
    if (!e.nativeEvent.isTrusted) {
      m.sintetico = true;
      return;
    }
    const tecla = e.code || e.key;
    const desceu = m.descidas.get(tecla);
    if (desceu !== undefined) {
      m.pressoes.push(performance.now() - desceu);
      m.descidas.delete(tecla);
    }
  }

  function aoColar(e: React.ClipboardEvent) {
    e.preventDefault();
    medida.current.colagens++;
    setAviso("Colar não vale no teste: digite o texto.");
  }

  const progresso = Math.round((digitado.length / texto.length) * 100);
  return (
    <section aria-label={`${ROTULO_DO_TESTE[rodada.teste]}, nível ${ROTULO_DO_NIVEL[rodada.nivel]}`} className="mx-auto flex max-w-3xl flex-col gap-4">
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
            {digitado.length} de {texto.length} caracteres
          </Selo>
          <Selo tom={rodada.valendo ? "marca" : "neutro"}>{rodada.valendo ? "Valendo" : "Treino livre"} · {ROTULO_DO_NIVEL[rodada.nivel]}</Selo>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void finalizar()} disabled={estado !== "rodando"} className="min-h-11 sm:min-h-0">
          <Square size={13} aria-hidden /> Finalizar
        </Button>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-brand motion-safe:transition-[width] motion-safe:duration-150" style={{ width: `${progresso}%` }} />
      </div>

      {/* O texto para o leitor de tela; a cópia colorida abaixo é só para quem vê. */}
      <p id={idDoTexto} className="sr-only">
        Texto para digitar: {texto}
      </p>
      <div aria-hidden className="select-none whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-4 font-mono text-fs-4 leading-relaxed">
        {[...texto].map((ch, i) => {
          const d = digitado[i];
          const classe =
            d === undefined
              ? i === digitado.length
                ? "text-fg underline decoration-brand decoration-2 underline-offset-4"
                : "text-fg-muted"
              : d === ch
                ? "text-fg"
                : // O erro não fica só na cor: fundo e sublinhado ondulado também.
                  "rounded-sm bg-danger/10 text-danger underline decoration-wavy decoration-danger underline-offset-4";
          return (
            <span key={i} className={classe}>
              {ch}
            </span>
          );
        })}
      </div>

      <p id={idDaInstrucao} className="text-helper text-fg-muted">
        O relógio começa na primeira tecla. A rodada termina quando o texto acaba, quando o tempo acaba ou em “Finalizar” — o que ficar sem digitar desconta da precisão.
      </p>
      <label className="sr-only" htmlFor={`${id}-campo`}>
        Digite aqui o texto
      </label>
      <Textarea
        id={`${id}-campo`}
        value={digitado}
        onChange={aoDigitar}
        onKeyDown={aoDescer}
        onKeyUp={aoSubir}
        onPaste={aoColar}
        onDrop={(e) => e.preventDefault()}
        maxLength={texto.length}
        disabled={estado === "enviando"}
        aria-describedby={`${idDoTexto} ${idDaInstrucao}`}
        placeholder={estado === "pronto" ? "Comece a digitar aqui…" : undefined}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        rows={4}
        className="min-h-[112px] p-4 font-mono text-fs-4"
      />
      {aviso && <Aviso tom="atencao">{aviso}</Aviso>}
      {estado === "enviando" && <p className="text-ui text-fg-muted">Conferindo o resultado…</p>}
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
    </section>
  );
}
