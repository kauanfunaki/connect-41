import { AppShell } from "@/components/shell/AppShell";
import { SessionKeeper } from "@/components/shell/SessionKeeper";
import { ToastProvider } from "@/components/ui/Toast";
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
  const visibleSectors = sectors
    .filter((s) => sectorsWithModules.has(s))
    .map((s) => ({ code: s, label: sectorLabels[s] ?? s, color: sectorColors[s] ?? "#586577" }));

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
    <ToastProvider>
      <AppShell
        tenantId={tenantId}
        accessibleTenants={accessibleTenants}
        sectors={visibleSectors}
        canOpenAdmin={canOpenAdmin}
        unreadCount={unreadCount}
        profileName={me?.name ?? "Usuário"}
        profileRoleLabel={ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
        profilePhotoUrl={me?.photoUrl ?? null}
      >
        <SessionKeeper />
        {children}
      </AppShell>
    </ToastProvider>
  );
}
