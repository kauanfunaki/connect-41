"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";

/**
 * O "⋯" das linhas da Administração — o mesmo botão de `AcoesDeLinha` e
 * `AcoesDaLicenca`, aberto para qualquer lista de itens do menu. Mora aqui (e
 * não em `shared`) porque só as telas de admin o usam por enquanto.
 */
export function MenuDeMaisAcoes({
  rotulo = "Mais ações",
  largura = 180,
  children,
}: {
  rotulo?: string;
  largura?: number;
  children: (fechar: () => void) => React.ReactNode;
}) {
  return (
    <Popover
      align="right"
      width={largura}
      aria-label={rotulo}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={rotulo}
          aria-expanded={open}
          className={`h-7 w-7 rounded-md border inline-flex items-center justify-center transition-colors ${
            open ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
          }`}
        >
          <MoreHorizontal size={14} />
        </button>
      )}
    >
      {({ close }) => <div className="flex flex-col">{children(close)}</div>}
    </Popover>
  );
}

type Props = {
  /** A tela de edição (href) ou a função que abre a edição na própria linha. */
  editar?: string | (() => void);
  /** Excluir vai no "⋯", com confirmação — não fica a um clique do Editar. */
  excluir?: {
    action: () => Promise<void>;
    titulo: string;
    descricao?: string;
  };
  className?: string;
};

/**
 * Editar + "⋯ Excluir", as ações das listas de catálogo da Administração
 * (campos, tags, feriados, competências, obrigações).
 *
 * Eram "Editar" em texto cinza e "Excluir" em texto vermelho lado a lado
 * (`DeleteFieldButton`) — a regra da conferência de 30/09 é que ação é botão, e
 * que a ação que destrói vai no menu, longe do clique de quem só queria editar.
 */
export function AcoesDoItem({ editar, excluir, className = "" }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`.trim()}>
      {typeof editar === "string" ? (
        <Button variant="secondary" size="xs" href={editar}>
          <Pencil size={11} /> Editar
        </Button>
      ) : editar ? (
        <Button variant="secondary" size="xs" onClick={editar}>
          <Pencil size={11} /> Editar
        </Button>
      ) : null}
      {excluir && (
        <MenuDeMaisAcoes>
          {(fechar) => (
            <ItemDoMenu
              icone={<Trash2 />}
              danger
              onClick={() => {
                fechar();
                requestConfirm(
                  {
                    title: excluir.titulo,
                    description: excluir.descricao ?? "Esta ação não pode ser desfeita.",
                    destructive: true,
                    confirmLabel: "Excluir",
                  },
                  excluir.action
                );
              }}
            >
              Excluir
            </ItemDoMenu>
          )}
        </MenuDeMaisAcoes>
      )}
      {dialog}
    </span>
  );
}
