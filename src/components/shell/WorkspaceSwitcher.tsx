"use client";

import { ChevronDown } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { AvatarImage } from "@/components/shared/AvatarImage";

type Tenant = { id: string; name: string; logoUrl: string | null };

type Props = {
  tenants: Tenant[];
  currentTenantId: string;
};

function switchTenant(tenantId: string): void {
  document.cookie = `active_tenant_id=${tenantId}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  window.location.href = "/home";
}

export function WorkspaceSwitcher({ tenants, currentTenantId }: Props) {
  const current = tenants.find((t) => t.id === currentTenantId);
  const currentName = current?.name ?? "—";
  const canSwitch = tenants.length > 1;

  function switchTo(tenantId: string) {
    if (tenantId === currentTenantId) return;
    switchTenant(tenantId);
  }

  const cardInner = (
    <>
      <AvatarImage src={current?.logoUrl ?? null} name={currentName} size={32} shape="lg" fontSize={13} />
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Workspace</span>
        <span className="block text-[13px] font-medium text-fg truncate">{currentName}</span>
      </span>
      {canSwitch && <ChevronDown size={14} className="text-fg-muted flex-shrink-0" />}
    </>
  );

  const cardClass =
    "w-full flex items-center justify-center gap-2.5 px-2.5 py-2 rounded-xl bg-surface border border-border transition-colors";

  if (!canSwitch) {
    // TODO: com um único tenant acessível, o seletor fica só visual (sem troca real).
    return (
      <div className="px-3 pt-3 pb-1">
        <div className={cardClass}>{cardInner}</div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-1">
      <Dropdown
        width={220}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={`${cardClass} hover:bg-surface-hover hover:border-border-strong ${
              open ? "border-border-strong bg-surface-hover" : ""
            }`}
          >
            {cardInner}
          </button>
        )}
      >
        {tenants.map((t) => (
          <DropdownItem key={t.id} onClick={() => switchTo(t.id)}>
            <span className="flex items-center gap-2 min-w-0">
              <AvatarImage src={t.logoUrl} name={t.name} size={20} shape="lg" fontSize={10} />
              <span className={`truncate ${t.id === currentTenantId ? "text-brand font-semibold" : ""}`}>{t.name}</span>
            </span>
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}
