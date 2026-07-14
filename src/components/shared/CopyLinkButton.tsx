"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Copia o link da reunião pra área de transferência — usado no detalhe de
// item de Kanban e na Agenda, pra enviar ao cliente sem precisar entrar na
// reunião e copiar pela URL do provedor.
export function CopyLinkButton({ url, className = "" }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar link da reunião"
      className={`inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg transition-colors ${className}`.trim()}
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}
