"use client";

import { useToast } from "@/components/ui/Toast";

type Pastas = { nomePasta: string; subpastasContrato: string[] }[];

/**
 * O caminho da pasta do contrato na rede, para colar no Explorador de
 * Arquivos. O Connect não abre a pasta da rede: só o computador do escritório
 * alcança o compartilhamento. `null` quando não há pasta ou raiz configurada.
 */
export function caminhoDaPasta(raizUnc: string, pastas: Pastas): { caminho: string; nomePasta: string } | null {
  const alvo = pastas.find((p) => p.subpastasContrato.length > 0) ?? pastas[0];
  if (!alvo || !raizUnc) return null;
  const caminho = [raizUnc.replace(/\\+$/, ""), alvo.nomePasta, alvo.subpastasContrato[0]].filter(Boolean).join("\\");
  return { caminho, nomePasta: alvo.nomePasta };
}

/**
 * Copia o caminho e avisa. Era um botão próprio (`CopiarCaminho`); desde a
 * melhoria-813 (26/11/2026) a cópia é a ação da linha ou um item do ⋯ em
 * Contratos e Aditivos, e o botão saiu.
 */
export function useCopiarCaminho() {
  const toast = useToast();
  return async (caminho: string) => {
    try {
      await navigator.clipboard.writeText(caminho);
      toast.success("Caminho copiado. Cole no Explorador de Arquivos.");
    } catch {
      toast.error("Não foi possível copiar o caminho.");
    }
  };
}
