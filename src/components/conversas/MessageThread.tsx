"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { carregarMensagensAntigas } from "@/app/(app)/conversas/actions";

export type MessageItem = {
  id: string;
  senderLabel: string | null;
  messageType: string;
  content: string | null;
  isPrivate: boolean;
  attachments: { fileType: string; fileSize: number | null; url: string }[];
  createdAtLabel: string;
};

type Props = {
  conversationId: string;
  messages: MessageItem[];
  canViewPrivate: boolean;
  hasMore: boolean;
};

// Sem lib de tempo relativo dedicada no projeto — createdAtLabel já vem
// formatado pelo Server Component (mesmo padrão de formatInstantDate usado no
// resto do app).
export function MessageThread({ conversationId, messages, canViewPrivate, hasMore }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadedMore, setLoadedMore] = useState(false);

  function handleLoadOlder() {
    startTransition(async () => {
      await carregarMensagensAntigas(conversationId);
      setLoadedMore(true);
      router.refresh();
    });
  }

  const visible = messages.filter((m) => canViewPrivate || !m.isPrivate);

  return (
    <div className="flex flex-col gap-3">
      {hasMore && !loadedMore && (
        <button
          type="button"
          onClick={handleLoadOlder}
          disabled={isPending}
          className="self-center h-8 px-3 rounded-md border border-border-strong text-[12px] text-fg-muted hover:bg-surface-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Carregando…" : "Carregar mensagens anteriores"}
        </button>
      )}

      {visible.length === 0 && <p className="text-[13px] text-fg-muted text-center py-8">Nenhuma mensagem carregada ainda.</p>}

      {visible.map((m) => {
        const isOutgoing = m.messageType === "outgoing";
        return (
          <div key={m.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-[13px] ${
                m.isPrivate
                  ? "bg-warning/10 border border-warning/30"
                  : isOutgoing
                    ? "bg-brand text-on-brand"
                    : "bg-surface-hover border border-border"
              }`}
            >
              <div className={`text-[11px] mb-0.5 ${isOutgoing ? "text-on-brand/70" : "text-fg-muted"}`}>
                {m.senderLabel ?? (isOutgoing ? "Atendente" : "Contato")}
                {m.isPrivate ? " · nota interna" : ""}
              </div>
              {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
              {m.attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-1 flex items-center gap-1.5 text-[12px] underline ${isOutgoing ? "text-on-brand" : "text-brand"}`}
                >
                  <Paperclip size={12} /> {a.fileType}
                </a>
              ))}
              <div className={`text-[10.5px] mt-1 ${isOutgoing ? "text-on-brand/60" : "text-fg-muted"}`}>{m.createdAtLabel}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
