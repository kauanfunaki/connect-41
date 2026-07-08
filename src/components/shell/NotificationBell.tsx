"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Dropdown, DropdownSeparator } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationItem } from "@/components/shell/NotificationItem";

type NotificationEntry = { id: string; message: string; read: boolean; href: string | null; createdAt: string };

type Props = {
  unreadCount: number;
  notifications: NotificationEntry[];
};

export function NotificationBell({ unreadCount, notifications }: Props) {
  return (
    <Dropdown
      align="right"
      width={340}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title="Notificações"
          className={`relative w-[38px] h-[38px] inline-flex items-center justify-center rounded-[10px] border transition-colors ${
            open
              ? "bg-surface border-border-strong text-fg shadow-sm"
              : "bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong"
          }`}
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute top-[6px] right-[7px] min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold leading-[16px] text-center border-2 border-surface-hover">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-border">
        <p className="text-[12px] font-semibold text-fg-muted uppercase tracking-wider">Notificações</p>
        {unreadCount > 0 && <span className="text-[11px] font-semibold text-brand-hover">{unreadCount} não lidas</span>}
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="Nenhuma notificação" description="Você está em dia por aqui." />
      ) : (
        <div className="-mx-3">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              id={n.id}
              message={n.message}
              read={n.read}
              href={n.href}
              createdAt={n.createdAt}
            />
          ))}
        </div>
      )}

      <DropdownSeparator />
      <Link
        href="/notificacoes"
        className="block w-full text-center px-2 py-2 rounded-lg text-[13px] font-semibold text-brand-hover hover:bg-surface-hover transition-colors"
      >
        Ver todas
      </Link>
    </Dropdown>
  );
}
