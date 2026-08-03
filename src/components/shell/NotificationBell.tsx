"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
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
        <IconButton
          variant="framed"
          size="lg"
          active={open}
          onClick={toggle}
          title="Notificações"
          aria-label="Notificações"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold leading-none inline-flex items-center justify-center border-2 border-surface-hover">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </IconButton>
      )}
    >
      {/* "Ver todas" no cabeçalho, ao lado do título — não no rodapé. Embaixo
          da lista ele só aparecia depois de rolar todas as notificações, que é
          justamente o caminho que esse atalho existe pra encurtar. */}
      <div className="flex items-center justify-between gap-2 px-1 pb-2 mb-1 border-b border-border">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[12px] font-semibold text-fg-muted uppercase tracking-wider">Notificações</p>
          {unreadCount > 0 && (
            <span className="text-[11px] font-semibold text-brand-hover flex-shrink-0">{unreadCount} não lidas</span>
          )}
        </div>
        <Link
          href="/notificacoes"
          className="flex-shrink-0 px-1.5 py-0.5 -mr-1 rounded-md text-[12px] font-semibold text-brand-hover hover:bg-surface-hover transition-colors"
        >
          Ver todas
        </Link>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<Bell />} title="Nenhuma notificação" description="Você está em dia por aqui." />
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
    </Dropdown>
  );
}
