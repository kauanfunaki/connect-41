"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Copia o caminho da pasta do contrato na rede, para colar no Explorador de
 * Arquivos. O Connect não abre a pasta da rede: só o computador do escritório
 * alcança o compartilhamento.
 */
export function CopiarCaminho({
  raizUnc,
  pastas,
}: {
  raizUnc: string;
  pastas: { nomePasta: string; subpastasContrato: string[] }[];
}) {
  const toast = useToast();
  const alvo = pastas.find((p) => p.subpastasContrato.length > 0) ?? pastas[0];
  if (!alvo || !raizUnc) return null;
  const caminho = [raizUnc.replace(/\\+$/, ""), alvo.nomePasta, alvo.subpastasContrato[0]].filter(Boolean).join("\\");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(caminho);
      toast.success("Caminho copiado. Cole no Explorador de Arquivos.");
    } catch {
      toast.error("Não foi possível copiar o caminho.");
    }
  }

  return (
    <Button variant="ghost" size="xs" onClick={copiar} title={caminho} aria-label={`Copiar o caminho da pasta ${alvo.nomePasta}`}>
      <Copy size={13} aria-hidden /> Copiar caminho
    </Button>
  );
}
