"use client";

import Link from "next/link";
import { BookOpen, ChevronDown, CircleHelp, LifeBuoy } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

const BASE =
  "h-[38px] inline-flex items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";
const NORMAL = "bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong";
const ATIVO = "bg-surface border-border-strong text-fg shadow-sm";

/**
 * O "?" do topo.
 *
 * - Tela com artigo: um clique no "?" abre a ajuda **desta** tela (o atalho
 *   que o Kauan gostou), e a setinha ao lado abre um menu com ela e com a
 *   **central de ajuda** — o caminho para a ajuda geral sem passar pelo artigo
 *   específico (revisão de 05/10).
 * - Tela sem artigo: o "?" leva direto à central, como sempre.
 */
export function BotaoDeAjuda({ linkDaTela, naAjuda }: { linkDaTela: string | null; naAjuda: boolean }) {
  if (!linkDaTela) {
    return (
      <Link
        href="/ajuda"
        aria-label="Central de ajuda"
        data-dica="Central de ajuda"
        aria-current={naAjuda ? "page" : undefined}
        className={`${BASE} w-[38px] ${naAjuda ? ATIVO : NORMAL}`}
      >
        <CircleHelp size={16} />
      </Link>
    );
  }

  return (
    <div className="h-[38px] inline-flex items-stretch rounded-md border border-border bg-surface-hover text-fg-secondary">
      <Link
        href={linkDaTela}
        aria-label="Ajuda desta tela"
        data-dica="Ajuda desta tela"
        className="h-full w-[34px] inline-flex items-center justify-center rounded-l-md hover:text-fg hover:bg-surface transition-colors"
      >
        <CircleHelp size={16} />
      </Link>
      <Dropdown
        align="right"
        width={280}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Mais ajuda"
            aria-expanded={open}
            data-dica={open ? undefined : "Mais ajuda"}
            className={`h-[36px] w-[22px] inline-flex items-center justify-center border-l border-border rounded-r-md transition-colors hover:text-fg hover:bg-surface ${
              open ? "text-fg bg-surface" : ""
            }`}
          >
            <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      >
        {({ close }) => (
          <nav aria-label="Ajuda" className="flex flex-col gap-1 -m-1">
            <ItemDoMenu
              href={linkDaTela}
              onClick={close}
              icone={<BookOpen size={16} />}
              titulo="Ajuda desta tela"
              texto="O passo a passo da tela aberta."
            />
            <ItemDoMenu
              href="/ajuda"
              onClick={close}
              icone={<LifeBuoy size={16} />}
              titulo="Central de ajuda"
              texto="Todas as telas que você usa, com busca e os primeiros passos."
            />
          </nav>
        )}
      </Dropdown>
    </div>
  );
}

function ItemDoMenu({
  href,
  onClick,
  icone,
  titulo,
  texto,
}: {
  href: string;
  onClick: () => void;
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-start gap-3 rounded-md px-2.5 py-2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <span className="mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">{icone}</span>
      <span className="flex flex-col min-w-0">
        <span className="text-[13.5px] font-semibold text-fg">{titulo}</span>
        <span className="text-[12px] leading-snug text-fg-secondary">{texto}</span>
      </span>
    </Link>
  );
}
