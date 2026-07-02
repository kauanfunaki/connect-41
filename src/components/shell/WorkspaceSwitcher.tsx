"use client";

type Tenant = { id: string; name: string };

type Props = {
  tenants: Tenant[];
  currentTenantId: string;
};

export function WorkspaceSwitcher({ tenants, currentTenantId }: Props) {
  if (tenants.length <= 1) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tenantId = e.target.value;
    document.cookie = `active_tenant_id=${tenantId}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    window.location.href = "/home";
  }

  return (
    <div className="px-3 pt-3 pb-1">
      <select
        value={currentTenantId}
        onChange={handleChange}
        className="w-full h-8 px-2 rounded-md border border-border bg-canvas text-[12px] font-medium text-fg outline-none focus:border-brand transition-colors"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
