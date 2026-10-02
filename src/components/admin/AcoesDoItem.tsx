"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes as MenuDaUi } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";

/**
 * O "⋯" das linhas da Administração: o `MenuDeMaisAcoes` de `ui`, com os itens
 * empilhados e a assinatura que as telas do admin já usam (`largura`, e
 * `children` recebendo só o `fechar`).
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
    <MenuDaUi align="right" width={largura} rotulo={rotulo}>
      {({ close }) => <div className="flex flex-col">{children(close)}</div>}
    </MenuDaUi>
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
