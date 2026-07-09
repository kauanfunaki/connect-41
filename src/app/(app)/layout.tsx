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
  const [unreadCount, me, accessibleTenants, recentNotifications] = await Promise.all([
    ctx.userId
      ? prisma.notification.count({ where: { tenantId, userId: ctx.userId, read: false } })
      : Promise.resolve(0),
    ctx.userId
      ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, photoUrl: true } })
      : Promise.resolve(null),
    role === "SUPER_ADMIN"
      ? prisma.tenant.findMany({
          where: { OR: [{ id: ctx.homeTenantId }, { accessGrants: { some: { userId: ctx.userId } } }] },
          select: { id: true, name: true, logoUrl: true },
          orderBy: { name: "asc" },
        })
      // Sem múltiplos tenants: busca só o nome do tenant atual, pro seletor de
      // workspace da sidebar mostrar o nome real mesmo sem troca disponível.
      : prisma.tenant.findMany({
          where: { id: tenantId },
          select: { id: true, name: true, logoUrl: true },
        }),
    ctx.userId
      ? prisma.notification.findMany({
          where: { tenantId, userId: ctx.userId },
          orderBy: { createdAt: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  const notifications = recentNotifications.map((n) => ({
    id: n.id,
    message: n.message,
    read: n.read,
    href:
      n.entityType && n.entityId
        ? n.entityType === "COMPANY"
          ? `/empresas/${n.entityId}`
          : `/pessoas/${n.entityId}`
        : null,
    createdAt: n.createdAt.toLocaleString("pt-BR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    }),
  }));

  return (
    <ToastProvider>
      <AppShell
        tenantId={tenantId}
        accessibleTenants={accessibleTenants}
        sectors={visibleSectors}
        canOpenAdmin={canOpenAdmin}
        unreadCount={unreadCount}
        notifications={notifications}
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
