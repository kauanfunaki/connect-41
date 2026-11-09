"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { enderecoCurtoDoPedido } from "@/lib/solicitacoes/linkPublico";

/**
 * O link público de pedido de um assunto (09/11/2026), com Copiar e Abrir —
 * na linha do assunto e no painel de edição. O endereço vem pronto do
 * servidor; aqui só se lê, copia e abre.
 *
 * `aviso`: por que o link não recebe pedido agora (assunto inativo,
 * Solicitações desligadas, ainda não salvo) — junto do link, para ninguém
 * divulgar um endereço fora do ar sem saber.
 */
export function LinkPublicoDoAssunto({ endereco, aviso }: { endereco: string; aviso?: string | null }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  async function copiar() {
    // Só o caminho, sem APP_PUBLIC_URL (ambiente local): completa com o endereço da janela.
    const inteiro = /^https?:\/\//i.test(endereco) ? endereco : new URL(endereco, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(inteiro);
      setEstado("copiado");
      setTimeout(() => setEstado("parado"), 1500);
    } catch {
      setEstado("falhou");
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-1 min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
        <span className="flex min-w-0 flex-1 basis-48 items-center gap-1.5 text-fs-2 text-fg-secondary">
          <Link2 size={13} aria-hidden className="flex-shrink-0 text-fg-muted" />
          <span className="truncate" title={endereco}>
            Link público: {enderecoCurtoDoPedido(endereco)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Button type="button" variant="secondary" size="xs" onClick={copiar}>
            {estado === "copiado" ? <Check size={11} aria-hidden className="text-success-fg" /> : <Copy size={11} aria-hidden />}
            <span aria-live="polite">{estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não deu para copiar" : "Copiar link"}</span>
          </Button>
          <Button href={endereco} nativo target="_blank" rel="noopener noreferrer" variant="ghost" size="xs">
            <ExternalLink size={11} aria-hidden /> Abrir
          </Button>
        </span>
      </div>
      {aviso && <p className="text-fs-2 text-warning-fg">{aviso}</p>}
    </div>
  );
}
