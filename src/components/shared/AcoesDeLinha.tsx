"use client";

import { Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { abreNoPainel } from "@/lib/painelDeCadastro";

type Props = {
  foraDeOperacao: boolean;
  onToggle: () => void;
  editarHref: string;
  /** Itens a mais no "⋯", depois do Inativar/Reativar. Recebe o `close` do menu. */
  itensExtras?: (close: () => void) => React.ReactNode;
  className?: string;
};

/**
 * Ações diretas dos cadastros; a inativação mantém a confirmação do chamador.
 *
 * Editar é botão; Inativar vai no "⋯" (15/10/2026). Era um botão vermelho à
 * vista em toda linha de Empresas, Pessoas, Plano de contas e Colaboradores, ao
 * lado do Editar — e o que tira o registro da operação fica no menu, mesmo
 * sendo a única ação dele (D3). Reativar, sozinho, volta a ser botão.
 */
export function AcoesDeLinha({ foraDeOperacao, onToggle, editarHref, itensExtras, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`.trim()}>
      <Button variant="secondary" size="xs" href={editarHref} scroll={!abreNoPainel(editarHref)}>
        <Pencil size={11} /> Editar
      </Button>
      <MenuDeMaisAcoes align="right" width={180}>
        {({ close }) => (
          <>
            <ItemDoMenu
              icone={foraDeOperacao ? <Power /> : <PowerOff />}
              danger={!foraDeOperacao}
              onClick={() => {
                close();
                onToggle();
              }}
            >
              {foraDeOperacao ? "Reativar" : "Inativar"}
            </ItemDoMenu>
            {itensExtras?.(close)}
          </>
        )}
      </MenuDeMaisAcoes>
    </span>
  );
}
