"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { caminhoDoMenuAtivo as ativa } from "@/lib/caminhoDoMenu";
import { useNaFaixa } from "@/components/shell/NavLink";

export type TelaDoPainel = { label: string; href: string; icon?: React.ReactNode; ativa?: boolean };

/** Um painel aberto por vez: quem abre avisa, e os outros fecham. */
const EVENTO_ABRIU = "c41-painel-do-item";

const ABRE_MS = 90;
const FECHA_MS = 180;

/**
 * O painel que abre **ao lado da sidebar** quando o mouse para num item que tem
 * telas dentro — Cadastros, os grupos de um setor (Contas, Banco e caixa…),
 * e Gestão. Os setores em "Todos os setores" não têm painel: o clique
 * entra no ambiente do setor (decisão de 30/09).
 *
 * Referência pedida pelo Kauan em 30/09 (o menu do HubStrom): ver o que tem
 * dentro sem abrir a tela do grupo nem esticar a sidebar. O clique no item
 * continua indo para a tela do grupo, que segue existindo.
 *
 * Fora da árvore da sidebar (portal): ela rola, e um painel `absolute` seria
 * cortado pela borda dela. Só em tela com mouse e a partir de `lg` — no
 * celular a sidebar é gaveta, e passar o dedo não é passar o mouse.
 *
 * Nem na faixa de ícones (menu recolhido, 14/10/2026): lá o mouse parado no
 * ícone mostra o nome da tela, e as telas de dentro não aparecem — o clique
 * leva à tela principal do item (desenho aprovado pelo Kauan).
 */
export function PainelDoItem({
  titulo,
  telas,
  cor,
  abrirPorClique = false,
  children,
}: {
  /** Rótulo do alto do painel, em versalete na cor do setor. */
  titulo: string;
  telas: TelaDoPainel[];
  /** Cor do setor do rótulo — o painel mora no `body`, fora do alcance de `--c41-setor`. */
  cor?: string;
  /** Menu de navegação também disponível por clique, na faixa e no toque. */
  abrirPorClique?: boolean;
  children: React.ReactNode | ((props: { aberto: boolean; alternar: () => void; painelId: string }) => React.ReactNode);
}) {
  const pathname = usePathname();
  const naFaixa = useNaFaixa();
  const id = useId();
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
    const left = (sidebar?.right ?? item.right) + 8;
    setPos({ top, left: abrirPorClique ? Math.max(8, Math.min(left, window.innerWidth - 268)) : left });
  }, [abrirPorClique]);

  function agendar(abrir: boolean) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberto(abrir), abrir ? ABRE_MS : FECHA_MS);
  }

  function fechar() {
    clearTimeout(timer.current);
    setAberto(false);
  }
  function alternar() {
    setAberto((atual) => !atual);
  }

  // Uma abertura agendada antes de navegar não deve reabrir o painel na
  // próxima tela. O clique também cancela o temporizador imediatamente.
  useEffect(() => () => clearTimeout(timer.current), [pathname]);

  // Foco de teclado num item e o mouse noutro abriam dois painéis ao mesmo
  // tempo (visto em 30/09): abrir um fecha os outros.
  useEffect(() => {
    function outroAbriu(e: Event) {
      if ((e as CustomEvent<string>).detail !== id) {
        clearTimeout(timer.current);
        setAberto(false);
      }
    }
    window.addEventListener(EVENTO_ABRIU, outroAbriu);
    return () => window.removeEventListener(EVENTO_ABRIU, outroAbriu);
  }, [id]);
  useEffect(() => {
    if (aberto) window.dispatchEvent(new CustomEvent(EVENTO_ABRIU, { detail: id }));
  }, [aberto, id]);

  // Posição antes da pintura e a cada rolagem da sidebar; a altura só existe
  // depois do painel na tela, daí a segunda passada.
  useEffect(() => {
    if (!aberto) return;
    posicionar();
    const id = requestAnimationFrame(posicionar);
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearTimeout(timer.current);
        setAberto(false);
        if (abrirPorClique) {
          e.preventDefault(); e.stopPropagation();
          itemRef.current?.querySelector("button")?.focus();
        }
      }
    }
    function fora(e: PointerEvent) {
      const alvo = e.target as Node;
      if (!itemRef.current?.contains(alvo) && !painelRef.current?.contains(alvo)) fechar();
    }
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    document.addEventListener("keydown", tecla);
    if (abrirPorClique) document.addEventListener("pointerdown", fora);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberto, posicionar, abrirPorClique]);

  // Trocou de tela: o painel fecha (o clique num item dele navegou).
  const [rotaAnterior, setRotaAnterior] = useState(pathname);
  if (rotaAnterior !== pathname) {
    setRotaAnterior(pathname);
    setAberto(false);
  }

  const gatilho = typeof children === "function" ? children({ aberto, alternar, painelId: id }) : children;
  if (telas.length === 0 || (naFaixa && !abrirPorClique)) return <>{gatilho}</>;

  return (
    <div
      ref={itemRef}
      onClick={abrirPorClique ? () => clearTimeout(timer.current) : fechar}
      onMouseEnter={() => podeAbrir() && agendar(true)}
      onMouseLeave={() => agendar(false)}
      onFocus={() => !abrirPorClique && podeAbrir() && agendar(true)}
      onBlur={(e) => {
        const para = e.relatedTarget as Node | null;
        if (para && painelRef.current?.contains(para)) return;
        agendar(false);
      }}
    >
      {gatilho}
      {aberto &&
        createPortal(
          <div
            id={id}
            ref={painelRef}
            role="menu"
            aria-label={titulo}
            onKeyDown={(e) => {
              if (!abrirPorClique || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const itens = [...(painelRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
              const atual = itens.indexOf(document.activeElement as HTMLElement);
              const proximo = e.key === "Home" ? 0 : e.key === "End" ? itens.length - 1 : (atual + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
              itens[proximo]?.focus();
            }}
            onMouseEnter={() => agendar(true)}
            onMouseLeave={() => agendar(false)}
            onBlur={(e) => {
              const para = e.relatedTarget as Node | null;
              if (para && (painelRef.current?.contains(para) || itemRef.current?.contains(para))) return;
              agendar(false);
            }}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="c41-surgir fixed z-50 w-[260px] max-h-[calc(100dvh-16px)] overflow-y-auto scroll-y rounded-lg border border-border-strong bg-surface-elevated shadow-lg p-2"
          >
            {/* Rótulo cinza com o ponto na cor do setor, como o título do grupo
                no menu (07/10/2026): pintado na cor do setor, o texto de 11px
                dava 3,1 a 3,7:1 no claro e 2,3:1 (Contábil) no escuro — a cor
                do setor é acento pequeno, não texto. */}
            <p className="c41-rotulo flex items-center gap-2 px-2.5 pt-1.5 pb-2 mb-1 border-b border-border">
              <span aria-hidden className="inline-block size-2 rounded-full flex-shrink-0" style={{ backgroundColor: cor ?? "var(--c41-brand)" }} />
              <span className="truncate">{titulo}</span>
            </p>
            <ul className="flex flex-col gap-0.5">
              {telas.map((t) => {
                const atual = t.ativa ?? ativa(pathname, t.href);
                return (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      role="menuitem"
                      aria-current={atual ? "page" : undefined}
                      onClick={fechar}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-dropdown font-medium transition-colors ${
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
