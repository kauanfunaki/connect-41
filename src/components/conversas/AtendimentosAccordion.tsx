"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { carregarMensagens, carregarMensagensAntigas, type MensagemAtendimento } from "@/app/(app)/conversas/actions";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";

export type AtendimentoResumo = {
  id: string;
  dateLabel: string; // data do atendimento (lastActivityAt formatada) — chave de busca da auditoria
  channelLabel: string;
  statusLabel: string;
  status: string; // cru, pra cor do badge
  assigneeLabel: string | null;
  messageCount: number | null;
};

// 4 cores distintas por status — aberta (em andamento), pendente (aguardando
// alguém), adiada (pausada por escolha do atendente) e resolvida (encerrada)
// são estados bem diferentes pra fins de auditoria, não deveriam parecer iguais.
// Era uma pílula à mão de 10,5px com o mapa de classes; virou o `Selo`, com os
// mesmos quatro tons (auditoria DRG-06, 07/10/2026).
export const STATUS_BADGE: Record<string, TomDoSelo> = {
  open: "sucesso",
  pending: "atencao",
  snoozed: "marca",
  resolved: "neutro",
};

function Mensagens({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<MensagemAtendimento[] | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  // Carrega uma única vez na montagem (o componente só monta quando o item é
  // expandido pela primeira vez — o accordion desmonta ao fechar).
  useEffect(() => {
    let cancelled = false;
    void carregarMensagens(conversationId).then((result) => {
      if (!cancelled) setMessages(result);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (messages === null) {
    return <p className="text-[length:var(--fs-2)] text-fg-muted py-4 text-center">Carregando mensagens…</p>;
  }

  async function handleLoadOlder() {
    setIsLoadingOlder(true);
    const result = await carregarMensagensAntigas(conversationId);
    setMessages(result.messages);
    if (result.loaded === 0) setExhausted(true);
    setIsLoadingOlder(false);
  }

  return (
    <div className="flex flex-col gap-2.5 pt-3">
      {!exhausted && messages.length > 0 && (
        <Button
          variant="secondary"
          size="xs"
          className="self-center"
          onClick={handleLoadOlder}
          disabled={isLoadingOlder}
        >
          {isLoadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}
        </Button>
      )}

      {messages.length === 0 && <p className="text-[length:var(--fs-2)] text-fg-muted py-3 text-center">Nenhuma mensagem neste atendimento.</p>}

      {messages.map((m) => {
        const isOutgoing = m.messageType === "outgoing";
        return (
          <div key={m.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] ${
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
              <div className={`text-[length:var(--fs-micro)] mt-1 ${isOutgoing ? "text-on-brand/60" : "text-fg-muted"}`}>{m.createdAtLabel}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Lista colapsada de atendimentos (janelas de conversa do Chatwoot) — cada
// item mostra data/canal/status/atendente fechado; expandir carrega as
// mensagens sob demanda. Reusado na área global /conversas e nas abas
// "Conversas" de Empresa e Pessoa.
export function AtendimentosAccordion({ atendimentos, defaultOpenId }: { atendimentos: AtendimentoResumo[]; defaultOpenId?: string }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(defaultOpenId ? [defaultOpenId] : []));

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (atendimentos.length === 0) {
    return <p className="text-[length:var(--fs-2)] text-fg-muted py-3">Nenhum atendimento registrado.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {atendimentos.map((a) => {
        const isOpen = openIds.has(a.id);
        return (
          <div key={a.id}>
            {/* `aria-expanded`/`aria-controls`: o leitor de tela não sabia que o
                botão abre e fecha as mensagens (auditoria DRG-25, 07/10/2026). */}
            <button
              type="button"
              onClick={() => toggle(a.id)}
              aria-expanded={isOpen}
              aria-controls={`atendimento-${a.id}`}
              className="w-full flex items-center gap-2.5 px-1 py-2.5 text-left hover:bg-surface-hover rounded-md transition-colors"
            >
              <span className="text-fg-muted flex-shrink-0">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
              <span className="text-[length:var(--fs-2)] font-medium text-fg flex-shrink-0 tabular-nums">{a.dateLabel}</span>
              <span className="text-[12px] text-fg-muted flex-shrink-0">{a.channelLabel}</span>
              <Selo tom={STATUS_BADGE[a.status] ?? STATUS_BADGE.resolved} className="flex-shrink-0">
                {a.statusLabel}
              </Selo>
              {a.assigneeLabel && <span className="text-[length:var(--fs-micro)] text-fg-muted flex-shrink-0 hidden sm:inline">{a.assigneeLabel}</span>}
              <span className="text-[12px] text-fg-muted truncate min-w-0">
                {a.messageCount != null ? `${a.messageCount} ${a.messageCount === 1 ? "mensagem" : "mensagens"}` : "—"}
              </span>
            </button>
            {isOpen && (
              <div id={`atendimento-${a.id}`} className="pl-7 pr-2 pb-3">
                <Mensagens conversationId={a.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
