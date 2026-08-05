"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Rascunho local do teste. Sem isto, fechar a aba/perder conexão no meio de um
// DISC (24 blocos × 2 escolhas = 48 interações) descartava tudo em silêncio — o
// candidato não tem login nem como retomar, então simplesmente abandonava.
//
// Escopo por token: o rascunho é do link, não do navegador. Assim dois links
// diferentes na mesma máquina não se misturam.
const PREFIX = "connect:teste:";

function storageKey(token: string): string {
  return `${PREFIX}${token}`;
}

type Options<T> = {
  token: string;
  /** Estado inicial quando não há rascunho salvo. */
  initial: T;
  /** Descarta rascunho com formato inesperado (banco de perguntas mudou, versão antiga). */
  isValid: (value: unknown) => value is T;
};

export function useTestDraft<T>({ token, initial, isValid }: Options<T>) {
  const [value, setValue] = useState<T>(initial);
  // Só depois de tentar restaurar é que passamos a gravar — senão o primeiro
  // render (ainda com `initial`) sobrescreveria o rascunho salvo.
  const [restored, setRestored] = useState(false);
  const [hadDraft, setHadDraft] = useState(false);
  const keyRef = useRef(storageKey(token));

  useEffect(() => {
    const key = keyRef.current;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) {
          setValue(parsed);
          setHadDraft(true);
        } else {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // localStorage indisponível (modo privado/quota) — segue sem rascunho.
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(keyRef.current, JSON.stringify(value));
    } catch {
      // Sem espaço/permissão: o formulário continua funcionando em memória.
    }
  }, [value, restored]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(keyRef.current);
    } catch {
      // nada a fazer
    }
  }, []);

  const dismissRestoredNotice = useCallback(() => setHadDraft(false), []);

  return { value, setValue, restored, hadDraft, dismissRestoredNotice, clear };
}
