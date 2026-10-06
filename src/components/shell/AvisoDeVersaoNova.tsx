"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EVENTO_VERSAO_NOVA, tratarVersaoAntiga } from "@/lib/versaoNova";

type Props = {
  /** Quem foi atualizado, como a pessoa conhece: "O Connect" ou "O portal". */
  quem?: string;
};

// Faixa no topo quando a aba ficou numa versão anterior do Connect (ver
// src/lib/versaoNova.ts). Chega por dois caminhos: quem pegou o erro avisa
// pelo evento, e o erro que ninguém pegou (promessa rejeitada solta) é
// reconhecido aqui. "Agora não" esconde até o próximo erro.
export function AvisoDeVersaoNova({ quem = "O Connect" }: Props) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    function mostrar() {
      setVisivel(true);
    }
    function aoRejeitar(e: PromiseRejectionEvent) {
      if (tratarVersaoAntiga(e.reason)) e.preventDefault();
    }
    window.addEventListener(EVENTO_VERSAO_NOVA, mostrar);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      window.removeEventListener(EVENTO_VERSAO_NOVA, mostrar);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, []);

  if (!visivel) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-surface-elevated border border-brand/30 rounded-lg shadow-[var(--c41-shadow-lg)] px-4 py-3"
    >
      <span className="w-7 h-7 rounded-md bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
        <RefreshCw size={14} />
      </span>
      <p className="text-[14px] text-fg">
        <span className="font-semibold">{quem} foi atualizado.</span>{" "}
        <span className="text-fg-muted">Recarregue a página para continuar.</span>
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="primary" size="sm" onClick={() => window.location.reload()}>
          Recarregar
        </Button>
        {/* Revisão de 05/10: botão não é link — era texto cinza ao lado do Recarregar. */}
        <Button type="button" variant="ghost" size="sm" onClick={() => setVisivel(false)}>
          Agora não
        </Button>
      </div>
    </div>
  );
}

/**
 * O que o error boundary mostra quando o erro é de versão antiga — uma action
 * chamada dentro de transição sobe até ele. "Tentar novamente" não resolveria:
 * a action continua não existindo até a página recarregar.
 */
export function ErroDeVersaoAntiga() {
  return (
    <div className="p-6 max-w-[1440px] mx-auto">
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-10 flex flex-col items-center text-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
          <RefreshCw size={18} />
        </span>
        <p className="text-[14px] font-semibold text-fg">O Connect foi atualizado.</p>
        <p className="text-[13px] text-fg-muted max-w-[360px]">
          Esta página ainda está na versão anterior. Recarregue para continuar.
        </p>
        <Button type="button" onClick={() => window.location.reload()} variant="primary" className="font-medium mt-1">
          Recarregar a página
        </Button>
      </div>
    </div>
  );
}
