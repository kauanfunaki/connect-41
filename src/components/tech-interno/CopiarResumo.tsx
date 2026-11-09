"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Copia o resumo do período em texto, uma linha por item com o link, para
 * colar num canal (06/11/2026). O texto chega pronto do servidor: este
 * componente não importa a regra, que lê o banco.
 */
export function CopiarResumo({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
      setTimeout(() => setEstado("parado"), 1500);
    } catch {
      setEstado("falhou");
    }
  }
  return (
    <Button variant="secondary" onClick={copiar} title="Copia o resumo em texto, com o link de cada item">
      {estado === "copiado" ? <Check size={14} className="text-success-fg" aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não deu para copiar" : "Copiar resumo"}</span>
    </Button>
  );
}
