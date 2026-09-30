"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** `grupo`: subtítulo dentro do painel — o setor com muitas telas (o BPO tem 18) lista por grupo. */
export type TelaDoPainel = { label: string; href: string; icon?: React.ReactNode; grupo?: string };

const ABRE_MS = 90;
const FECHA_MS = 180;

function ativa(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * O painel que abre **ao lado da sidebar** quando o mouse para num item que tem
 * telas dentro — Cadastros, os grupos de um setor (Contas, Banco e caixa…),
 * Gestão, e os setores em "Todos os setores".
 *
 * Referência pedida pelo Kauan em 30/09 (o menu do HubStrom): ver o que tem
 * dentro sem abrir a tela do grupo nem esticar a sidebar. O clique no item
 * continua indo para a tela do grupo, que segue existindo.
 *
 * Fora da árvore da sidebar (portal): ela rola, e um painel `absolute` seria
 * cortado pela borda dela. Só em tela com mouse e a partir de `lg` — no
 * celular a sidebar é gaveta, e passar o dedo não é passar o mouse.
 */
export function PainelDoItem({
  titulo,
  telas,
  cor,
  children,
}: {
  /** Rótulo do alto do painel, em versalete na cor do setor. */
  titulo: string;
  telas: TelaDoPainel[];
  /** Cor do setor do rótulo — o painel mora no `body`, fora do alcance de `--c41-setor`. */
  cor?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const podeAbrir = useCallback(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (min-width: 1024px)").matches,
    []
  );

  const posicionar = useCallback(() => {
    const item = itemRef.current?.getBoundingClientRect();
    const sidebar = itemRef.current?.closest("aside")?.getBoundingClientRect();
    if (!item) return;
    const altura = painelRef.current?.offsetHeight ?? 0;
    const top = Math.max(8, Math.min(item.top - 10, window.innerHeight - altura - 8));
    setPos({ top, left: (sidebar?.right ?? item.right) + 8 });
  }, []);

  function agendar(abrir: boolean) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberto(abrir), abrir ? ABRE_MS : FECHA_MS);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  // Posição antes da pintura e a cada rolagem da sidebar; a altura só existe
  // depois do painel na tela, daí a segunda passada.
  useEffect(() => {
    if (!aberto) return;
    posicionar();
    const id = requestAnimationFrame(posicionar);
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    document.addEventListener("keydown", tecla);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, posicionar]);

  // Trocou de tela: o painel fecha (o clique num item dele navegou).
  const [rotaAnterior, setRotaAnterior] = useState(pathname);
  if (rotaAnterior !== pathname) {
    setRotaAnterior(pathname);
    setAberto(false);
  }

  if (telas.length === 0) return <>{children}</>;

  return (
    <div
      ref={itemRef}
      onMouseEnter={() => podeAbrir() && agendar(true)}
      onMouseLeave={() => agendar(false)}
      onFocus={() => podeAbrir() && agendar(true)}
      onBlur={(e) => {
        const para = e.relatedTarget as Node | null;
        if (para && painelRef.current?.contains(para)) return;
        agendar(false);
      }}
    >
      {children}
      {aberto &&
        createPortal(
          <div
            ref={painelRef}
            role="menu"
            aria-label={titulo}
            onMouseEnter={() => agendar(true)}
            onMouseLeave={() => agendar(false)}
            onBlur={(e) => {
              const para = e.relatedTarget as Node | null;
              if (para && (painelRef.current?.contains(para) || itemRef.current?.contains(para))) return;
              agendar(false);
            }}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="c41-surgir fixed z-50 w-[260px] max-h-[calc(100vh-16px)] overflow-y-auto scroll-y rounded-lg border border-border-strong bg-surface-elevated shadow-[var(--c41-shadow-lg)] p-2"
          >
            <p className="px-2.5 pt-1.5 pb-2 mb-1 border-b border-border text-[11px] font-semibold uppercase tracking-wider" style={{ color: cor ?? "var(--c41-brand)" }}>
              {titulo}
            </p>
            <ul className="flex flex-col gap-0.5">
              {telas.map((t, i) => {
                const atual = ativa(pathname, t.href);
                const novoGrupo = t.grupo && t.grupo !== telas[i - 1]?.grupo;
                return (
                  <li key={t.href}>
                    {novoGrupo && (
                      <p className={`px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-fg-muted ${i > 0 ? "pt-2.5" : "pt-0.5"}`}>{t.grupo}</p>
                    )}
                    <Link
                      href={t.href}
                      role="menuitem"
                      aria-current={atual ? "page" : undefined}
                      onClick={() => setAberto(false)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium transition-colors ${
                        atual ? "bg-selected-bg text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                      }`}
                    >
                      {t.icon && (
                        <span className={`flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${atual ? "text-brand" : "text-fg-muted"}`}>{t.icon}</span>
                      )}
                      <span className="truncate">{t.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
