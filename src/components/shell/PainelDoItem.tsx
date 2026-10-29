"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
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
  area = "marca",
  icone,
  verTudo,
  abrirPorClique = false,
  children,
}: {
  /** Rótulo do alto do painel, em versalete. */
  titulo: string;
  telas: TelaDoPainel[];
  /**
   * A área de uso do item (28/10/2026): o cabeçalho, os ícones e a tela aberta
   * na cor dela, como o item no menu. O painel mora no `body`, fora do
   * `data-grupo` da sidebar, por isso a área vem por prop. Sem área, "marca".
   */
  area?: string;
  /** O ícone do item, repetido no cabeçalho do painel (29/10/2026). */
  icone?: React.ReactNode;
  /** O rodapé "Ver as telas do grupo": a página do grupo, onde o clique no item leva. */
  verTudo?: { href: string; rotulo: string };
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
            data-grupo={area}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="c41-painel-lateral fixed z-50 w-[260px] max-h-[calc(100dvh-16px)] overflow-y-auto scroll-y rounded-lg border border-border-strong bg-surface-elevated shadow-lg"
          >
            {/* Cabeçalho na cor da área (29/10/2026, pedido do Kauan: mais
                dinâmico): o ícone do item num quadradinho e um fundo leve da
                área. O texto continua cinza — em 11px a cor da área dava menos
                de 4,5:1 (07/10/2026); a cor é acento, não texto. */}
            <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-b from-grupo/12 to-transparent px-3 pt-3 pb-2.5">
              <span aria-hidden className="inline-flex size-7 flex-shrink-0 items-center justify-center rounded-md bg-grupo/15 text-grupo [&>svg]:size-4">
                {icone ?? <span className="size-2 rounded-full bg-grupo" />}
              </span>
              <p className="c41-rotulo min-w-0 flex-1 truncate">{titulo}</p>
              <span className="text-fs-1 tabular-nums text-fg-muted">{telas.length}</span>
            </div>
            <ul className="flex flex-col gap-0.5 p-2">
              {telas.map((t, i) => {
                const atual = t.ativa ?? ativa(pathname, t.href);
                return (
                  // Os itens entram um depois do outro (25 ms cada); com
                  // movimento reduzido, entram juntos (globals.css).
                  <li key={t.href} className="c41-cascata" style={{ animationDelay: `${40 + i * 25}ms` }}>
                    <Link
                      href={t.href}
                      role="menuitem"
                      aria-current={atual ? "page" : undefined}
                      onClick={fechar}
                      className={`group/tela relative flex items-center gap-2.5 rounded-md py-1.5 pl-2 pr-2.5 text-dropdown font-medium transition-colors ${
                        atual ? "bg-grupo/12 text-grupo-fg" : "text-fg-secondary hover:bg-grupo/8 hover:text-fg focus-visible:bg-grupo/8"
                      }`}
                    >
                      {/* A tela aberta: a barra da área à esquerda, como o item ativo no menu. */}
                      {atual && <span aria-hidden className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-grupo" />}
                      {t.icon && (
                        <span
                          className={`inline-flex size-7 flex-shrink-0 items-center justify-center rounded-md transition-colors [&>svg]:size-4 ${
                            atual ? "bg-grupo/20 text-grupo" : "bg-surface-hover text-fg-muted group-hover/tela:bg-grupo/15 group-hover/tela:text-grupo"
                          }`}
                        >
                          {t.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      <ChevronRight
                        size={14}
                        aria-hidden
                        className={`flex-shrink-0 text-grupo transition-[opacity,transform] duration-150 ${
                          atual ? "opacity-100" : "-translate-x-1 opacity-0 group-hover/tela:translate-x-0 group-hover/tela:opacity-100 group-focus-visible/tela:translate-x-0 group-focus-visible/tela:opacity-100"
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {verTudo && (
              <Link
                href={verTudo.href}
                role="menuitem"
                onClick={fechar}
                className="group/ver flex items-center justify-between border-t border-border px-4 py-2.5 text-fs-2 font-medium text-grupo-fg transition-colors hover:bg-grupo/8"
              >
                {verTudo.rotulo}
                <ArrowRight size={14} aria-hidden className="transition-transform group-hover/ver:translate-x-0.5" />
              </Link>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
