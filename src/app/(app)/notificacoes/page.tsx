import { Bell } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { NotificationItem } from "@/components/shell/NotificationItem";
import { MarkAllReadButton } from "@/components/shell/MarkAllReadButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { marcarTodasLidas } from "./actions";

export default async function NotificacoesPage() {
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const notifications = ctx.userId
    ? await prisma.notification.findMany({
        where: { tenantId: ctx.tenantId, userId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Notificações</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount !== 1 ? "s" : ""}` : "Tudo em dia"}
          </p>
        </div>
        {unreadCount > 0 && <MarkAllReadButton action={marcarTodasLidas} />}
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {notifications.length === 0 ? (
          <EmptyState icon={<Bell />} title="Nenhuma notificação por aqui ainda" />
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                id={n.id}
                message={n.message}
                read={n.read}
                href={
                  n.entityType && n.entityId
                    ? n.entityType === "COMPANY"
                      ? `/empresas/${n.entityId}`
                      : `/pessoas/${n.entityId}`
                    : null
                }
                createdAt={n.createdAt.toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
