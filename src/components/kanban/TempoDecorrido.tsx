"use client";

import { useEffect, useState } from "react";
import { formatarDecorrido, segundosDesde } from "@/lib/datetime";

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
 * `suppressHydrationWarning` porque o valor é legitimamente diferente entre o
 * render do servidor e o do cliente — são relógios diferentes, em instantes
 * diferentes. É o caso de uso para o qual o atributo existe.
 */
export function TempoDecorrido({
  startedAt,
  className = "",
}: {
  startedAt: string;
  className?: string;
}) {
  const [segundos, setSegundos] = useState(() => segundosDesde(startedAt));

  useEffect(() => {
    const id = setInterval(() => setSegundos(segundosDesde(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <span className={`tnum ${className}`.trim()} suppressHydrationWarning>
      {formatarDecorrido(segundos)}
    </span>
  );
}
