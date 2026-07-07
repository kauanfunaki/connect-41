import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notificacoes"
      className="relative w-[38px] h-[38px] inline-flex items-center justify-center rounded-[10px] bg-surface-hover border border-border text-fg-secondary hover:text-fg hover:border-border-strong transition-colors"
      title="Notificações"
    >
      <Bell size={17} />
      {unreadCount > 0 && (
        <span className="absolute top-[6px] right-[7px] min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold leading-[16px] text-center border-2 border-surface-hover">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
