"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";

type Props = {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
  align?: "left" | "right";
  width?: number;
  /** Nome acessível do painel. */
  "aria-label"?: string;
};

/**
 * Painel ancorado que abre **por cima de tudo**, fora da árvore da página.
 *
 * O `Dropdown` é `absolute` dentro do próprio pai, e dentro de uma tabela com
 * rolagem lateral (`TabelaNoDesktop` é `overflow-x-auto`) ele é cortado pela
 * borda do casco. Foi o que aconteceu com a baixa de /pagar em 30/09: a data e
 * o "Confirmar" abriam na célula e empurravam o resto para fora da tela. Aqui o
 * painel vai para o `body` (portal) com posição fixa calculada a partir do
 * botão, e vira para cima quando não cabe embaixo — desde 02/10/2026 pelo
 * `PainelFlutuante`, que o calendário do campo de data também usa.
 */
export function Popover({ trigger, children, align = "left", width = 240, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ancoraRef = useRef<HTMLSpanElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  // O Esc vem pela pilha de camadas do `PainelFlutuante` (ver `camadas.ts`).

  // Teclado (auditoria de UX, 30/10/2026): o painel mora no fim do `body`, então
  // sem isto o Tab saía do "⋯" para a página e as ações dele — Inativar,
  // Excluir, que pela regra de 30/09 só existem ali — ficavam fora de alcance.
  // Ao abrir, o foco entra no primeiro item; ao fechar, volta para o botão que
  // abriu, a não ser que a pessoa já tenha ido para outro lugar (clicou num
  // campo) ou que uma janela aberta pelo item tenha levado o foco.
  useEffect(() => {
    if (!open) return;
    const conteudo = conteudoRef.current;
    const gatilho = ancoraRef.current?.querySelector<HTMLElement>(FOCAVEL) ?? null;
    const quadro = requestAnimationFrame(() => {
      // Quem já pôs o foco num campo (o funil das colunas, com `autoFocus`) fica.
      if (conteudo?.contains(document.activeElement)) return;
      focaveis(conteudo)[0]?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(quadro);
      const ativo = document.activeElement;
      if (!ativo || ativo === document.body || conteudo?.contains(ativo)) gatilho?.focus({ preventScroll: true });
    };
  }, [open]);

  function noTeclado(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return;
    const itens = focaveis(conteudoRef.current);
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement as HTMLElement);
    // Tab passando da ponta fecha e devolve o foco ao gatilho, como num menu do
    // sistema — seguir para o `body` largaria a pessoa no fim da página.
    if (e.key === "Tab") {
      const saindo = e.shiftKey ? atual <= 0 : atual === itens.length - 1;
      if (saindo) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    // Setas andam entre os itens; dentro de campo de texto elas são do campo.
    const alvo = e.target as HTMLElement;
    if (alvo.closest("input, textarea, select, [contenteditable='true']")) return;
    const passo = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (passo !== 0) {
      e.preventDefault();
      itens[(atual + passo + itens.length) % itens.length].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      itens[e.key === "Home" ? 0 : itens.length - 1].focus();
    }
  }

  return (
    <>
      <span ref={ancoraRef} className="inline-flex">
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </span>
      <PainelFlutuante
        ancora={ancoraRef}
        aberto={open}
        onFechar={close}
        largura={width}
        align={align}
        aria-label={ariaLabel}
        className="p-3 text-dropdown"
      >
        <div ref={conteudoRef} onKeyDown={noTeclado}>
          {typeof children === "function" ? children({ close }) : children}
        </div>
      </PainelFlutuante>
    </>
  );
}

const FOCAVEL =
  "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex^='-'])";

function focaveis(raiz: HTMLElement | null): HTMLElement[] {
  if (!raiz) return [];
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEL)).filter((el) => el.getClientRects().length > 0);
}

/**
 * Item de menu dentro do `Popover` (e do `Dropdown`) — mesmo desenho do
 * `DropdownItem`, com ícone.
 *
 * Com `descricao` (07/10/2026), a variante de duas linhas: o ícone num selo azul,
 * o título e uma linha de apoio embaixo — a do menu da ajuda, que tinha um
 * `ItemDoMenu` local com o mesmo nome e outro desenho. Era um dos seis desenhos
 * de linha de menu do app; o "Criar" da Home também passou a usar este.
 */
export function ItemDoMenu({
  onClick,
  href,
  icone,
  descricao,
  danger = false,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  href?: string;
  icone?: React.ReactNode;
  /** Linha de apoio embaixo do título; troca para o desenho de duas linhas. */
  descricao?: string;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cor = danger ? "text-danger hover:bg-danger-bg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg";
  const cls = descricao
    ? `w-full flex items-start gap-3 text-left px-2.5 py-2 rounded-md transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:pointer-events-none ${cor}`
    : `w-full flex items-center gap-2 text-left px-2 py-2 rounded-md text-dropdown font-medium transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:pointer-events-none ${cor}`;
  const conteudo = descricao ? (
    <>
      {icone && (
        <span className="mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand [&>svg]:w-4 [&>svg]:h-4">
          {icone}
        </span>
      )}
      <span className="flex flex-col min-w-0">
        <span className="text-ui font-semibold text-fg">{children}</span>
        <span className="text-fs-2 leading-snug text-fg-secondary">{descricao}</span>
      </span>
    </>
  ) : (
    <>
      {icone && <span className="flex-shrink-0 text-fg-muted [&>svg]:w-3.5 [&>svg]:h-3.5">{icone}</span>}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {conteudo}
    </button>
  );
}
