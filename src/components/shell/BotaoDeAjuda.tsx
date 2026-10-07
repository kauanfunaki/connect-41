"use client";

import Link from "next/link";
import { BookOpen, ChevronDown, CircleHelp, LifeBuoy } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { ItemDoMenu } from "@/components/ui/Popover";

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
    // O `IconButton framed lg` com `href` (07/10/2026), e não uma cópia dele.
    return (
      <IconButton
        href="/ajuda"
        variant="framed"
        size="lg"
        active={naAjuda}
        aria-label="Central de ajuda"
        data-dica="Central de ajuda"
        aria-current={naAjuda ? "page" : undefined}
      >
        <CircleHelp size={16} />
      </IconButton>
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
            <ItemDoMenu href={linkDaTela} onClick={close} icone={<BookOpen size={16} />} descricao="O passo a passo da tela aberta.">
              Ajuda desta tela
            </ItemDoMenu>
            <ItemDoMenu
              href="/ajuda"
              onClick={close}
              icone={<LifeBuoy size={16} />}
              descricao="Todas as telas que você usa, com busca e os primeiros passos."
            >
              Central de ajuda
            </ItemDoMenu>
          </nav>
        )}
      </Dropdown>
    </div>
  );
}
