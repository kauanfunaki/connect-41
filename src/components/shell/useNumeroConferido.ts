"use client";

import { useEffect, useEffectEvent, useState } from "react";

/** De quanto em quanto o menu e o sino conferem o número (21/10/2026). */
export const INTERVALO_DA_CONFERENCIA_MS = 60_000;

/**
 * Um número do layout que se confere sozinho (21/10/2026 — "se chega uma
 * solicitação, ninguém vê sem abrir a tela"): a cada minuto, e ao voltar à aba
 * do navegador, pergunta o número de novo. Com a aba escondida não pergunta
 * nada — volta a perguntar quando a pessoa volta. Quando o layout manda outro
 * número (navegação, `router.refresh`), o dele volta a valer.
 */
export function useNumeroConferido(doLayout: number, buscar: () => Promise<number>, ligado = true): number {
  const [estado, setEstado] = useState({ doLayout, valor: doLayout });
  const valor = estado.doLayout === doLayout ? estado.valor : doLayout;

  const conferir = useEffectEvent(() => {
    if (!ligado || document.visibilityState !== "visible") return;
    void buscar()
      .then((v) => setEstado({ doLayout, valor: v }))
      .catch(() => {});
  });

  useEffect(() => {
    if (!ligado) return;
    const relogio = setInterval(() => conferir(), INTERVALO_DA_CONFERENCIA_MS);
    const aoVoltar = () => conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ligado]);

  return valor;
}
