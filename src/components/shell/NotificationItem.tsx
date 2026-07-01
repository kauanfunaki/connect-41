"use client";

import Link from "next/link";
import { marcarNotificacaoLida } from "@/app/(app)/notificacoes/actions";

type Props = {
  id: string;
  message: string;
  read: boolean;
  href: string | null;
  createdAt: string;
};

export function NotificationItem({ id, message, read, href, createdAt }: Props) {
  function handleClick() {
    if (!read) marcarNotificacaoLida(id);
  }

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-3 ${!read ? "bg-brand-subtle/40" : ""}`}
    >
      <span
        className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${read ? "bg-transparent" : "bg-brand"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg">{message}</p>
        <p className="text-[11px] text-fg-muted mt-0.5">{createdAt}</p>
      </div>
    </div>
  );

  if (!href) {
    return (
      <div onClick={handleClick} className="cursor-pointer">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} onClick={handleClick} className="block hover:bg-surface-2 transition-colors">
      {content}
    </Link>
  );
}
