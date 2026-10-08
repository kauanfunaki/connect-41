"use client";

import {
  Archive,
  ArchiveRestore,
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
import { AvatarImage } from "@/components/shared/AvatarImage";

// O cartão de uma notificação — o mesmo no sino e na central (02/10/2026):
// ícone do tipo no tom do catálogo, título curto em negrito com a mensagem
// embaixo, chip da empresa/pessoa/card, quando, e o ponto de não lida. No
// hover, marcar lida/não lida, arquivar e remover.
//
// Com autor (05/10/2026), a foto de quem fez entra no lugar do ícone, e o
// ícone do tipo vira um selo no canto da foto: dá para ver quem e o quê.

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
  arquivo: Archive,
};

const TONS: Record<Tom, string> = {
  brand: "bg-brand-subtle text-brand",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
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

/** A foto de quem fez, com o ícone do tipo num selo no canto; sem autor, só o ícone. */
function RostoDaNotificacao({ n }: { n: NotificacaoNaTela }) {
  if (!n.autor) return <IconeDaNotificacao icone={n.icone} tom={n.tom} />;
  const Icone = ICONES[n.icone];
  return (
    <span className="relative flex-shrink-0 size-[34px]">
      <AvatarImage src={n.autor.foto} name={n.autor.nome} size={34} bordered={false} />
      {/* Fundo opaco por baixo: o tom do selo é translúcido, e a foto vazaria. */}
      <span aria-hidden className="absolute -bottom-1 -right-1 size-[18px] rounded-full bg-surface-elevated ring-2 ring-surface-elevated">
        <span className={`size-full inline-flex items-center justify-center rounded-full ${TONS[n.tom]}`}>
          <Icone size={10} />
        </span>
      </span>
    </span>
  );
}

type Props = {
  n: NotificacaoNaTela;
  onAbrir: (n: NotificacaoNaTela) => void;
  onAlternarLida: (n: NotificacaoNaTela) => void;
  /** Arquiva, ou desarquiva quando ela já está arquivada. */
  onArquivar: (n: NotificacaoNaTela) => void;
  onRemover: (n: NotificacaoNaTela) => void;
  /** Central: a hora vai na linha do tempo, à esquerda — o cartão não repete. */
  semTempo?: boolean;
  /** Central: seleção múltipla. */
  selecao?: { marcada: boolean; onMudar: (marcada: boolean) => void };
};

export function CartaoDeNotificacao({ n, onAbrir, onAlternarLida, onArquivar, onRemover, semTempo = false, selecao }: Props) {
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
      <RostoDaNotificacao n={n} />
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
          {n.autor && <span className="text-[11px] font-medium text-fg-secondary">{n.autor.nome}</span>}
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
          onClick={() => onArquivar(n)}
          title={n.arquivada ? "Desarquivar" : "Arquivar"}
          aria-label={n.arquivada ? "Desarquivar notificação" : "Arquivar notificação"}
          className="size-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2"
        >
          {n.arquivada ? <ArchiveRestore size={14} /> : <Archive size={14} />}
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
