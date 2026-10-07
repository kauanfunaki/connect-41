"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Copia o link da reunião pra área de transferência — usado no detalhe de
// item de Kanban e na Agenda, pra enviar ao cliente sem precisar entrar na
// reunião e copiar pela URL do provedor.
//
// `variant="botao"`: o botão xs com borda, para ficar ao lado de outros botões
// de uma linha ("Entrar", "Editar"); o padrão é o texto discreto.
export function CopyLinkButton({
  url,
  className = "",
  variant = "texto",
}: {
  url: string;
  className?: string;
  variant?: "texto" | "botao";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (variant === "botao") {
    return (
      <Button variant="secondary" size="xs" onClick={handleCopy} title="Copiar link da reunião" className={className}>
        {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
        {copied ? "Copiado" : "Copiar link"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar link da reunião" aria-label="Copiar link da reunião"
      className={`inline-flex items-center gap-1 text-fs-2 text-fg-muted hover:text-fg transition-colors ${className}`.trim()}
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}
