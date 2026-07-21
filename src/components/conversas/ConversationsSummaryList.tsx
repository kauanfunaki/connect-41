import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export type ConversationSummary = {
  id: string;
  channel: string;
  status: string;
  lastMessagePreview: string | null;
  lastActivityLabel: string | null;
};

// Lista compacta reaproveitada nas abas "Conversas" de Empresa e Pessoa —
// mesma listagem, sem filtro/busca (isso fica na área global /conversas).
export function ConversationsSummaryList({ conversations }: { conversations: ConversationSummary[] }) {
  if (conversations.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl">
        <EmptyState icon={<MessageCircle />} title="Nenhuma conversa vinculada" description="Conversas do Chatwoot vinculadas a este registro aparecem aqui." />
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
      {conversations.map((c) => (
        <Link key={c.id} href={`/conversas?id=${c.id}`} className="block px-4 py-3 hover:bg-surface-hover transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-fg truncate">{c.lastMessagePreview ?? "Sem mensagens ainda"}</span>
            <span className="flex-shrink-0 text-[11px] text-fg-muted">{c.lastActivityLabel}</span>
          </div>
          <p className="text-[11.5px] text-fg-muted mt-0.5">
            {c.channel} · {c.status}
          </p>
        </Link>
      ))}
    </div>
  );
}
