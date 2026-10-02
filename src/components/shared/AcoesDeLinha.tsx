"use client";

import { Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";

type Props = {
  /** Quem está fora de operação (inativo, cancelado) volta com "Reativar". */
  foraDeOperacao: boolean;
  onToggle: () => void;
  editarHref: string;
  className?: string;
};

/**
 * As ações que fecham a linha de /empresas, /pessoas e /clientes.
 *
 * Eram três cópias do mesmo markup, e já tinham começado a divergir — por isso
 * moram aqui. Desde o polimento de 30/09 seguem a regra da conferência do BPO,
 * "botão não é link": **Editar** é botão, e Inativar/Reativar foi para o menu
 * "⋯" — é a ação rara e a que tira o cadastro da lista, então não fica a um
 * clique acidental do Editar. O rótulo é a única regra de negócio daqui:
 * "Reativar" quando está fora de operação, "Inativar" quando está dentro.
 */
export function AcoesDeLinha({ foraDeOperacao, onToggle, editarHref, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`.trim()}>
      <Button variant="secondary" size="xs" href={editarHref}>
        <Pencil size={11} /> Editar
      </Button>
      <MenuDeMaisAcoes align="right" width={180}>
        {({ close }) => (
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
        )}
      </MenuDeMaisAcoes>
    </span>
  );
}
