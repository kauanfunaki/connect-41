"use client";

import { useEffect } from "react";

// Mantém a sessão viva renovando o access_token (15min) via refresh token antes
// que ele expire. Sem isto, o usuário seria deslogado no meio da navegação a
// cada 15min. Como o access agora é sempre curto, revogar/desativar a conta no
// servidor derruba a sessão no próximo ciclo (~10min), não em até 30 dias.
//
// - Renova a cada 10min (folga de 5min antes do TTL de 15min).
// - Renova também ao voltar o foco/visibilidade da aba (aba que ficou horas
//   aberta em background pega um token fresco assim que o usuário volta).
// - Se o refresh falhar (token revogado/expirado/conta inativa), manda pro login.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function SessionKeeper() {
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok && !cancelled) {
          window.location.href = "/login";
        }
      } catch {
        // erro de rede transitório — ignora e tenta de novo no próximo ciclo
      }
    }

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
