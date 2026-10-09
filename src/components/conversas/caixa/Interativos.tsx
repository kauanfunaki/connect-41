"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

/** Quem está digitando não navega: ↑↓ e Esc ficam com o campo. */
function digitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** ↑ anterior, ↓ próxima, Esc fecha — fora dos campos de texto e sem modal aberto. */
export function NavegacaoPorTeclado({ anterior, proxima, fechar }: { anterior: string | null; proxima: string | null; fechar: string }) {
  const router = useRouter();
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || digitando(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const destino = e.key === "ArrowUp" ? anterior : e.key === "ArrowDown" ? proxima : e.key === "Escape" ? fechar : null;
      if (!destino) return;
      e.preventDefault();
      router.push(destino, { scroll: false });
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [anterior, proxima, fechar, router]);
  return null;
}

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={copiado ? "Copiado" : rotulo}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          // Sem permissão de área de transferência: o valor está à vista para selecionar.
        }
      }}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-surface-hover shrink-0"
    >
      {copiado ? <Check size={13} className="text-success-fg" /> : <Copy size={13} />}
    </button>
  );
}

export type AbaDoPainel = { chave: string; rotulo: string; conteudo: ReactNode };

/** As abas de baixo do painel (Conversa, Candidatura, Histórico…). A primeira abre. */
export function AbasDoPainel({ abas, inicial }: { abas: AbaDoPainel[]; inicial?: string }) {
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.chave ?? "");
  const atual = abas.find((a) => a.chave === ativa) ?? abas[0];
  if (!atual) return null;
  return (
    <div className="flex flex-col">
      <Tabs
        className="px-3 sm:px-4 sticky top-0 z-[1] bg-surface"
        active={atual.chave}
        onChange={setAtiva}
        tabs={abas.map((a) => ({ key: a.chave, label: a.rotulo, panelId: `aba-${a.chave}` }))}
      />
      <div id={`aba-${atual.chave}`} role="tabpanel" className="px-5 sm:px-6 py-4">
        {atual.conteudo}
      </div>
    </div>
  );
}

/** A lista de mensagens: abre no fim (a mais nova) e acompanha mensagem nova. */
export function RolarParaOFim({ children, quantas, className = "" }: { children: ReactNode; quantas: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [quantas]);
  return (
    <div ref={ref} className={`overflow-y-auto scroll-y ${className}`.trim()}>
      {children}
    </div>
  );
}
