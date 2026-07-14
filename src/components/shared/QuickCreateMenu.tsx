"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

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
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          <Plus size={14} />
          Criar
        </button>
      )}
    >
      <div className="flex flex-col gap-0.5">
        {canCreateCompany && <MenuLink href="/empresas/nova" label="Nova empresa" />}
        {canCreatePerson && <MenuLink href="/pessoas/nova" label="Nova pessoa" />}
        {canCreateTransfer && <MenuLink href="/transferencias/novo" label="Nova transferência" />}
      </div>
    </Dropdown>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="w-full text-left px-2 py-2 rounded-lg text-[length:var(--fs-dropdown)] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
    >
      {label}
    </Link>
  );
}
