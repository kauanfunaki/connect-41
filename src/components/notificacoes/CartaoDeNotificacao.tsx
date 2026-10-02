"use client";

import {
  ArrowLeftRight,
  AtSign,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  FileText,
  Inbox,
  Landmark,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  SquareKanban,
  User,
  Wallet,
  X,
} from "lucide-react";
import type { IconeDaNotificacao, Tom } from "@/lib/notificacoes/catalogo";
import type { NotificacaoNaTela, TipoDoChip } from "@/lib/notificacoes/consultas";
import { tempoRelativo } from "@/lib/notificacoes/tempo";
import { Checkbox } from "@/components/ui/Checkbox";

// O cartão de uma notificação — o mesmo no sino e na central (02/10/2026):
// ícone do tipo no tom do catálogo, título curto em negrito com a mensagem
// embaixo, chip da empresa/pessoa/card, quando, e o ponto de não lida. No
// hover, marcar lida/não lida e remover.

const ICONES: Record<IconeDaNotificacao, typeof Bell> = {
  transferencia: ArrowLeftRight,
  mencao: AtSign,
  comentario: MessageSquare,
  agenda: CalendarDays,
  mensagem: MessageCircle,
  candidato: Briefcase,
  whatsapp: MessageCircle,
  solicitacao: Inbox,
  aprovado: CircleCheck,
  recusado: CircleX,
  documento: FileText,
  prazo: CalendarClock,
  dinheiro: Wallet,
  processo: Landmark,
  alerta: CircleAlert,
  sino: Bell,
};

const TONS: Record<Tom, string> = {
  brand: "bg-brand-subtle text-brand",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-surface-2 text-fg-muted",
};

const ICONE_DO_CHIP: Record<TipoDoChip, typeof Bell> = {
  empresa: Building2,
  pessoa: User,
  card: SquareKanban,
  processo: Landmark,
  solicitacao: Inbox,
  conversa: MessageCircle,
  pendencia: FileText,
};

export function IconeDaNotificacao({ icone, tom, tamanho = 34 }: { icone: IconeDaNotificacao; tom: Tom; tamanho?: number }) {
  const Icone = ICONES[icone];
  return (
    <span
      aria-hidden
      style={{ width: tamanho, height: tamanho }}
      className={`flex-shrink-0 inline-flex items-center justify-center rounded-full ${TONS[tom]}`}
    >
      <Icone size={Math.round(tamanho * 0.47)} />
    </span>
  );
}

type Props = {
  n: NotificacaoNaTela;
  onAbrir: (n: NotificacaoNaTela) => void;
  onAlternarLida: (n: NotificacaoNaTela) => void;
  onRemover: (n: NotificacaoNaTela) => void;
  /** Central: a hora vai na linha do tempo, à esquerda — o cartão não repete. */
  semTempo?: boolean;
  /** Central: seleção múltipla. */
  selecao?: { marcada: boolean; onMudar: (marcada: boolean) => void };
};

export function CartaoDeNotificacao({ n, onAbrir, onAlternarLida, onRemover, semTempo = false, selecao }: Props) {
  const Chip = n.chip ? ICONE_DO_CHIP[n.chip.tipo] : null;
  return (
    <div
      className={`group relative flex items-start gap-3 rounded-lg px-3 py-3 transition-colors ${
        n.lida ? "hover:bg-surface-hover" : "bg-brand-subtle/40 hover:bg-brand-subtle/60"
      }`}
    >
      {selecao && (
        <span className="pt-2">
          <Checkbox
            checked={selecao.marcada}
            onChange={(e) => selecao.onMudar(e.target.checked)}
            aria-label={`Selecionar: ${n.titulo}`}
          />
        </span>
      )}
      <IconeDaNotificacao icone={n.icone} tom={n.tom} />
      <button
        type="button"
        onClick={() => onAbrir(n)}
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md"
      >
        <span className="flex items-baseline gap-2">
          <span className={`text-[13px] text-fg truncate ${n.lida ? "font-medium" : "font-semibold"}`}>{n.titulo}</span>
          {!n.lida && <span aria-label="não lida" className="flex-shrink-0 size-1.5 rounded-full bg-brand translate-y-[-1px]" />}
        </span>
        <span className="block text-[13px] text-fg-secondary leading-snug mt-0.5 line-clamp-2">{n.mensagem}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {n.chip && Chip && (
            <span className="inline-flex max-w-full items-center gap-1 h-5 px-1.5 rounded-md border border-border bg-surface text-[11px] font-medium text-fg-secondary">
              <Chip size={11} className="flex-shrink-0 text-fg-muted" />
              <span className="truncate">{n.chip.rotulo}</span>
            </span>
          )}
          {!semTempo && <span className="text-[11px] text-fg-muted tabular-nums">{tempoRelativo(new Date(n.criadaEm))}</span>}
        </span>
      </button>
      {/* Ações no hover (e no foco, para o teclado). Sempre visíveis no toque. */}
      <span className="flex-shrink-0 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onAlternarLida(n)}
          title={n.lida ? "Marcar como não lida" : "Marcar como lida"}
          aria-label={n.lida ? "Marcar como não lida" : "Marcar como lida"}
          className="size-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2"
        >
          {n.lida ? <RotateCcw size={14} /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onRemover(n)}
          title="Remover"
          aria-label="Remover notificação"
          className="size-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-danger hover:bg-danger-bg"
        >
          <X size={14} />
        </button>
      </span>
    </div>
  );
}
