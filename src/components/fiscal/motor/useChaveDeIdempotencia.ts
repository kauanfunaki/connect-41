"use client";

import { useCallback, useState } from "react";

const nova = () => `c41:${globalThis.crypto.randomUUID()}`;

/**
 * Uma `Idempotency-Key` por intenção do usuário (API-CONNECT §8.2): criada
 * quando o formulário abre, repetida no duplo clique e na nova tentativa, e
 * trocada depois de sucesso ou de recusa definitiva (4xx). Em falha de rede ou
 * 5xx a mesma chave fica, e repetir não cria nada em dobro.
 */
export function useChaveDeIdempotencia(): [string, () => void, (r: { ok: boolean; renovarChave?: boolean }) => void] {
  const [chave, setChave] = useState(nova);
  const renovar = useCallback(() => setChave(nova()), []);
  const depoisDe = useCallback((r: { ok: boolean; renovarChave?: boolean }) => {
    if (r.ok || r.renovarChave) setChave(nova());
  }, []);
  return [chave, renovar, depoisDe];
}
