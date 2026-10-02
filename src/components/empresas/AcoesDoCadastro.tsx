"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  editarHref: string;
  /** Nome do item, para o título da confirmação. */
  nome: string;
  excluir?: () => Promise<void>;
  /** Itens do "⋯" acima do Excluir — em Sócios, "Registrar saída". Recebe o `close` do menu. */
  itensExtras?: (close: () => void) => React.ReactNode;
};

/**
 * As ações da linha nas abas da ficha da empresa (cargos, departamentos,
 * benefícios, turnos, sócios).
 *
 * Eram "Editar" e "Excluir" em texto solto, lado a lado (até 30/09). Seguem o
 * desenho de `AcoesDeLinha` de Cadastros: **Editar** é botão, e o Excluir foi
 * para o "⋯" — é a ação rara e a que não volta, então não fica a um clique
 * acidental do Editar.
 *
 * A confirmação era a do `DeleteFieldButton` do admin, que dizia "Excluir o
 * campo…" e "Todos os valores preenchidos nele serão perdidos" até para um
 * cargo; aqui o texto é o de exclusão de cadastro.
 */
export function AcoesDoCadastro({ editarHref, nome, excluir, itensExtras }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  const temMenu = Boolean(excluir || itensExtras);

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Button variant="secondary" size="xs" href={editarHref}>
        <Pencil size={11} /> Editar
      </Button>
      {temMenu && (
        <MenuDeMaisAcoes align="right" width={190}>
          {({ close }) => (
            <>
              {itensExtras?.(close)}
              {excluir && (
                <ItemDoMenu
                  icone={<Trash2 />}
                  danger
                  onClick={() => {
                    close();
                    requestConfirm(
                      { title: `Excluir "${nome}"?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" },
                      excluir
                    );
                  }}
                >
                  Excluir
                </ItemDoMenu>
              )}
            </>
          )}
        </MenuDeMaisAcoes>
      )}
      {dialog}
    </span>
  );
}
