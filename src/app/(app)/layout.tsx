import Link from "next/link";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { NavItem, SectorNavItem } from "@/components/shell/NavLink";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { getSectorMaps } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { getSectorsWithEnabledModules } from "@/lib/modules";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  const { role, sectors, tenantId } = ctx;
  const isAdmin = isFullWrite(role);
  const canManageFields = isAdmin || (role === "SECTOR_ADMIN" && sectors.length > 0);
  const canOpenAdmin = isAdmin || canManageFields;
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(tenantId);
  const sectorsWithModules = await getSectorsWithEnabledModules(tenantId);
  const visibleSectors = sectors.filter((s) => sectorsWithModules.has(s));

  const prisma = getPrisma();
  const [unreadCount, me, accessibleTenants] = await Promise.all([
    ctx.userId
      ? prisma.notification.count({ where: { tenantId, userId: ctx.userId, read: false } })
      : Promise.resolve(0),
    ctx.userId
      ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, photoUrl: true } })
      : Promise.resolve(null),
    role === "SUPER_ADMIN"
      ? prisma.tenant.findMany({
          where: { OR: [{ id: ctx.homeTenantId }, { accessGrants: { some: { userId: ctx.userId } } }] },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* ── Sidebar ── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 h-12 px-4 border-b border-border flex-shrink-0">
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

        <WorkspaceSwitcher tenants={accessibleTenants} currentTenantId={tenantId} />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          <p className="px-2 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
            Geral
          </p>
          <NavItem href="/" icon="⊞" label="Início" />
          <NavItem href="/empresas" icon="🏢" label="Empresas" />
          <NavItem href="/pessoas" icon="👤" label="Pessoas" />
          <NavItem href="/kanban" icon="📋" label="Kanban" />
          <NavItem href="/transferencias" icon="🔁" label="Transferências" />

          {visibleSectors.length > 0 && (
            <>
              <p className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
                Meus Setores
              </p>
              {visibleSectors.map((s) => (
                <SectorNavItem
                  key={s}
                  href={`/setor/${s}`}
                  label={sectorLabels[s] ?? s}
                  color={sectorColors[s] ?? "#586577"}
                />
              ))}
            </>
          )}
        </nav>

        {/* Footer: tema */}
        <div className="border-t border-border px-4 py-2.5 flex items-center flex-shrink-0">
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-12 flex-shrink-0 flex items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <GlobalSearch />

          <div className="flex items-center gap-2 flex-shrink-0">
            {canOpenAdmin && (
              <Link
                href="/admin"
                title="Administração"
                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
              >
                ⚙️
              </Link>
            )}
            <NotificationBell unreadCount={unreadCount} />
            <ProfileMenu
              name={me?.name ?? "Usuário"}
              roleLabel={ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
              photoUrl={me?.photoUrl ?? null}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
