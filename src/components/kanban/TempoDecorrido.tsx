"use client";

import { useEffect, useState } from "react";
import { formatarDecorrido, minutosApontados, segundosDesde } from "@/lib/datetime";

/**
 * Contador ao vivo do cronômetro do kanban.
 *
 * A fonte é o `activeTimerStartedAt` gravado no servidor quando alguém aperta
 * Start — não um contador em memória. Isso é o que faz o número sobreviver a
 * recarregar a página, trocar de aba e abrir o item em outro dispositivo, e é
 * também o que permite mostrar há quanto tempo OUTRA pessoa está rastreando.
 *
 * Cada tique recalcula a partir do `startedAt` em vez de somar 1 ao estado:
 * navegador estrangula `setInterval` em aba de segundo plano, e um acumulador
 * voltaria atrasado em minutos quando a aba fosse reativada.
 *
 * O efeito só monta o intervalo: quem dá o valor inicial é o inicializador do
 * `useState`, e quem garante que ele rode de novo para um cronômetro novo é o
 * `key={startedAt}` no call-site. Ressincronizar por `setState` dentro do
 * efeito seria o que o `react-hooks/set-state-in-effect` proíbe, com razão —
 * causa um render descartado a cada troca.
 *
 * `mostrarApontamento` acrescenta " · vale 1 min": o cronômetro conta em
 * segundos, mas o apontamento é gravado em minuto cheio. Sem isto o contador
 * marcava `0:47` e o registro saía "1min", e parecia que o tempo não tinha
 * sido gravado. Dizer de antemão o que será gravado é mais honesto que
 * avisar depois.
 *
 * `suppressHydrationWarning` porque o valor é legitimamente diferente entre o
 * render do servidor e o do cliente — são relógios diferentes, em instantes
 * diferentes. É o caso de uso para o qual o atributo existe.
 */
export function TempoDecorrido({
  startedAt,
  className = "",
  mostrarApontamento = false,
}: {
  startedAt: string;
  className?: string;
  /** Mostra ao lado quanto isto vale em minutos apontados. */
  mostrarApontamento?: boolean;
}) {
  const [segundos, setSegundos] = useState(() => segundosDesde(startedAt));

  useEffect(() => {
    const id = setInterval(() => setSegundos(segundosDesde(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const minutos = minutosApontados(segundos);

  return (
    <span className="inline-flex items-baseline gap-1.5" suppressHydrationWarning>
      <span className={`tnum ${className}`.trim()}>{formatarDecorrido(segundos)}</span>
      {mostrarApontamento && (
        <span className="text-[11px] text-fg-muted tnum">
          vale {minutos} min
        </span>
      )}
    </span>
  );
}
