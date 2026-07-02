"use client";

import { useRouter } from "next/navigation";
import { marcarNotificacaoLida } from "@/app/(app)/notificacoes/actions";

type Props = {
  id: string;
  message: string;
  read: boolean;
  href: string | null;
  createdAt: string;
};

export function NotificationItem({ id, message, read, href, createdAt }: Props) {
  const router = useRouter();

  // Precisa esperar o marcarNotificacaoLida terminar ANTES de navegar — se for
  // "dispara e esquece" junto com um <Link>, a navegação client-side cancela a
  // requisição da Server Action no meio do caminho e a notificação nunca marca
  // como lida (bug real reportado: só "marcar todas" funcionava).
  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!read) await marcarNotificacaoLida(id);
    if (href) router.push(href);
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
        !read ? "bg-brand-subtle/40" : "hover:bg-surface-2"
      }`}
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
}
