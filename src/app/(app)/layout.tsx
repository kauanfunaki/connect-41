import { AppShell } from "@/components/shell/AppShell";
import { SessionKeeper } from "@/components/shell/SessionKeeper";
import { MeetingAlertOverlay } from "@/components/shell/MeetingAlertOverlay";
import { ToastProvider } from "@/components/ui/Toast";
import { getSectorMaps } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { getSectorsWithEnabledModules, getEnabledModuleCodes } from "@/lib/modules";
import { getModulesForSector, getModuleRoute } from "@/lib/module-catalog";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { formatInstantDateTime } from "@/lib/format";

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

  // Setor ativo (subworkspace). Resolvido em getAuthContext a partir do host e
  // do cookie; aqui só se completa com label e cor do cadastro do tenant.
  //
  // Um código que não existe neste tenant cai em "Todos" — o proxy não tem como
  // conferir existência sem ir ao banco, e conferir aqui é de graça porque os
  // setores já foram carregados.
  const activeSector =
    ctx.activeSector && sectorLabels[ctx.activeSector]
      ? {
          code: ctx.activeSector,
          label: sectorLabels[ctx.activeSector]!,
          color: sectorColors[ctx.activeSector] ?? "#586577",
        }
      : null;

  const enabledModules = activeSector ? await getEnabledModuleCodes(tenantId) : new Set<string>();
  const activeSectorModules = activeSector
    ? getModulesForSector(activeSector.code)
        .filter((m) => enabledModules.has(m.code))
        .map((m) => ({ code: m.code, label: m.label, href: getModuleRoute(m.code) ?? `/setor/${activeSector.code}/${m.code}` }))
    : [];

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
    createdAt: formatInstantDateTime(n.createdAt, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    }),
  }));

  return (
    <ToastProvider>
      <AppShell
        tenantId={tenantId}
        accessibleTenants={accessibleTenants}
        sectors={visibleSectors}
        activeSector={activeSector}
        activeSectorModules={activeSectorModules}
        canOpenAdmin={canOpenAdmin}
        canManageMeetings={canManageMeetings(ctx)}
        unreadCount={unreadCount}
        notifications={notifications}
        profileName={me?.name ?? "Usuário"}
        profileRoleLabel={ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
        profilePhotoUrl={me?.photoUrl ?? null}
        subscriptionReadOnly={ctx.subscriptionReadOnly}
        canSelfRegularizeSubscription={ctx.canSelfRegularizeSubscription}
      >
        <SessionKeeper />
        <MeetingAlertOverlay />
        {children}
      </AppShell>
    </ToastProvider>
  );
}
