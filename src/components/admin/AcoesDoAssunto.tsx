"use client";

import { Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  id: string;
  nome: string;
  ativo: boolean;
  alternar: () => Promise<{ error: string } | null>;
};

/**
 * Editar + "⋯ Desativar", as ações de um assunto das solicitações
 * (15/10/2026). Eram "Editar" em `sm` e o par "Desativar/Ativar" à vista; o
 * desenho agora é o das outras linhas da Administração (`UsuariosTable`,
 * `AcoesDeLinha`): Editar em `xs`, e tirar de uso no "⋯", com a confirmação.
 * Ativar, sozinho, volta a ser botão.
 */
export function AcoesDoAssunto({ id, nome, ativo, alternar }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function pedirTroca() {
    requestConfirm(
      {
        title: ativo ? `Desativar "${nome}"?` : `Ativar "${nome}"?`,
        description: ativo
          ? "Some da lista do cliente. As solicitações já abertas com ele continuam como estão."
          : "Volta para a lista que o cliente vê ao abrir uma solicitação.",
        confirmLabel: ativo ? "Desativar" : "Ativar",
        destructive: ativo,
      },
      async () => {
        const r = await alternar();
        if (r && "error" in r) throw new Error(r.error);
      }
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Button href={`/admin/assuntos?editar=${id}`} variant="secondary" size="xs">
        <Pencil size={11} /> Editar
      </Button>
      <MenuDeMaisAcoes rotulo={`Mais ações de ${nome}`} align="right" width={180}>
        {({ close }) => (
          <ItemDoMenu
            icone={ativo ? <PowerOff /> : <Power />}
            danger={ativo}
            onClick={() => {
              close();
              pedirTroca();
            }}
          >
            {ativo ? "Desativar" : "Ativar"}
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </span>
  );
}
