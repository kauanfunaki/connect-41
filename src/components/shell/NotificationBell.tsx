import Link from "next/link";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notificacoes"
      className="relative w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
      title="Notificações"
    >
      🔔
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-medium leading-[16px] text-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
