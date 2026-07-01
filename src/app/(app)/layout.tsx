import { headers } from "next/headers";
import Link from "next/link";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { getSectorMaps } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const role = h.get("x-user-role") ?? "";
  const tenantId = h.get("x-tenant-id") ?? "";
  const sectorsRaw = h.get("x-user-sectors") ?? "";
  const sectors = sectorsRaw ? sectorsRaw.split(",").filter(Boolean) : [];
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(tenantId);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* ── Sidebar ── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="flex items-center gap-2 h-12 px-4 border-b border-border flex-shrink-0">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] text-on-brand text-[13px] font-semibold"
            style={{ background: "var(--c41-brand-600)" }}
          >
            41
          </span>
          <span className="text-fg font-semibold text-[14px] tracking-[-0.01em]">
            Connect 41
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          <p className="px-2 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
            Geral
          </p>
          <NavItem href="/" icon="⊞" label="Início" />
          <NavItem href="/empresas" icon="🏢" label="Empresas" />
          <NavItem href="/pessoas" icon="👤" label="Pessoas" />
          <NavItem href="/pipelines" icon="📋" label="Pipelines" />
          <NavItem href="/handoffs" icon="🔁" label="Handoffs" />

          {sectors.length > 0 && (
            <>
              <p className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
                Meus Setores
              </p>
              {sectors.map((s) => (
                <SectorNavItem
                  key={s}
                  href={`/setor/${s}`}
                  label={sectorLabels[s] ?? s}
                  color={sectorColors[s] ?? "#586577"}
                />
              ))}
            </>
          )}

          {isAdmin && (
            <>
              <p className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
                Administração
              </p>
              <NavItem href="/admin/usuarios" icon="🔐" label="Usuários" />
              <NavItem href="/admin/setores" icon="🏷️" label="Setores" />
              <NavItem href="/admin/tenant" icon="🏛️" label="Empresa (Tenant)" />
            </>
          )}
        </nav>

        {/* Footer: role + logout */}
        <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-fg truncate">
              {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
            </p>
            <p className="text-[11px] text-fg-muted">
              {sectors.length} setor{sectors.length !== 1 ? "es" : ""}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-12 flex-shrink-0 flex items-center justify-between border-b border-border bg-surface px-6">
          <span className="text-[13px] text-fg-muted">Connect 41 · CRM</span>
          <span className="text-[12px] text-fg-muted">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-fg-secondary hover:bg-surface-2 hover:text-fg transition-colors"
    >
      <span className="text-[14px] leading-none">{icon}</span>
      {label}
    </Link>
  );
}

function SectorNavItem({
  href,
  label,
  color,
}: {
  href: string;
  label: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-fg-secondary hover:bg-surface-2 hover:text-fg transition-colors"
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      {label}
    </Link>
  );
}
