"use client";

import { useCallback, useRef, useState } from "react";

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

/**
 * Uma chave por ação quando o mesmo formulário envia ações diferentes
 * (26/10/2026): as quatro do "Executar" dividiam uma chave só, e trocar de
 * ação depois de uma falha de rede reaproveitava a chave da outra. Mesmas
 * regras de troca do `useChaveDeIdempotencia`, por ação.
 */
export function useChavesPorAcao(): [(acao: string) => string, (acao: string, r: { ok: boolean; renovarChave?: boolean }) => void] {
  const chaves = useRef(new Map<string, string>());
  const chaveDe = useCallback((acao: string) => {
    const chave = chaves.current.get(acao) ?? nova();
    chaves.current.set(acao, chave);
    return chave;
  }, []);
  const depoisDe = useCallback((acao: string, r: { ok: boolean; renovarChave?: boolean }) => {
    if (r.ok || r.renovarChave) chaves.current.delete(acao);
  }, []);
  return [chaveDe, depoisDe];
}
