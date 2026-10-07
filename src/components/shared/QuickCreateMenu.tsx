"use client";

import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { ItemDoMenu } from "@/components/ui/Popover";

type Props = {
  canCreateCompany: boolean;
  canCreatePerson: boolean;
  canCreateTransfer: boolean;
};

// Botão primário único no header da Home, com dropdown de atalhos de criação —
// substitui o card "Ações rápidas" antigo, que duplicava a navegação lateral
// (Empresas/Pessoas/Kanban/Notificações já têm entrada própria na sidebar).
export function QuickCreateMenu({ canCreateCompany, canCreatePerson, canCreateTransfer }: Props) {
  if (!canCreateCompany && !canCreatePerson && !canCreateTransfer) return null;

  return (
    <Dropdown
      align="right"
      width={200}
      trigger={({ toggle }) => (
        // Sem `rounded-full font-medium` (07/10/2026): o Button não resolve
        // conflito de classe e as duas nunca pegaram — o "Criar" sempre saiu
        // retangular e semibold, como os outros botões.
        <Button type="button" onClick={toggle} variant="primary">
          <Plus size={14} />
          Criar
        </Button>
      )}
    >
      {/* O item de menu do sistema (`ItemDoMenu`), e não um sétimo desenho. */}
      <div className="flex flex-col gap-0.5">
        {canCreateCompany && <ItemDoMenu href="/empresas/nova">Nova empresa</ItemDoMenu>}
        {canCreatePerson && <ItemDoMenu href="/pessoas/nova">Nova pessoa</ItemDoMenu>}
        {canCreateTransfer && <ItemDoMenu href="/transferencias/novo">Nova transferência</ItemDoMenu>}
      </div>
    </Dropdown>
  );
}
