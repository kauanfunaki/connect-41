import { Check, CircleDot, CornerUpLeft, PencilLine, Play, Plus, RotateCcw, SendHorizontal, UserPlus, type LucideIcon } from "lucide-react";
import type { HandoffEventType } from "@/generated/prisma/enums";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { TrechoDoTexto } from "@/lib/handoffAtividade";

export type ItemNaTela = {
  chave: string;
  tipo: HandoffEventType;
  /** null na finalização deduzida das transferências antigas (quem foi não ficou guardado). */
  autor: { nome: string; foto: string | null } | null;
  /** O nome do setor de quem agiu ("Contábil"), quando se sabe. */
  setorDoAutor: string | null;
  /** "começou a parte do Fiscal" — ou a linha inteira, sem autor. */
  frase: string;
  /** O comentário em trechos (com as menções marcadas), ou o motivo/resposta/resumo. */
  trechos: TrechoDoTexto[] | null;
  /** "Motivo", "Resposta" — o que o texto é, quando não é o comentário. */
  rotuloDoTexto: string | null;
  relativo: string;
  exato: string;
  iso: string;
  deduzido: boolean;
};

const ICONE: Record<HandoffEventType, LucideIcon> = {
  CREATED: Plus,
  STARTED: Play,
  DONE: Check,
  RETURNED: CornerUpLeft,
  RESENT: SendHorizontal,
  COMMENT: CircleDot,
  ASSIGNEES_CHANGED: UserPlus,
  EDITED: PencilLine,
  REOPENED: RotateCcw,
};

// A cor do círculo do evento: a mesma do sinal da situação que ele produz.
const COR_DO_ICONE: Partial<Record<HandoffEventType, string>> = {
  DONE: "bg-success/10 text-success-fg",
  RETURNED: "bg-danger/10 text-danger",
  STARTED: "bg-brand/10 text-brand",
  REOPENED: "bg-brand/10 text-brand",
};

const DEDUZIDO = "Transferência de antes do histórico (10/11/2026): esta linha foi deduzida das datas guardadas.";

function Quando({ item }: { item: ItemNaTela }) {
  return (
    <time dateTime={item.iso} title={item.exato} className="text-fg-muted whitespace-nowrap">
      {item.relativo}
      <span className="sr-only"> ({item.exato})</span>
    </time>
  );
}

function Texto({ trechos }: { trechos: TrechoDoTexto[] }) {
  return (
    <>
      {trechos.map((t, i) =>
        t.mencao ? (
          <span key={i} className="font-medium text-brand">
            {t.texto}
          </span>
        ) : (
          <span key={i}>{t.texto}</span>
        )
      )}
    </>
  );
}

/**
 * A linha do tempo da transferência (10/11/2026, pedido do Kauan), do mais
 * novo para o mais antigo, no desenho da dos Chamados: o comentário em cartão,
 * com a foto de quem escreveu; o resto numa linha com o ícone do que
 * aconteceu. A hora vem relativa ("há 2 h"), com a exata no passar do mouse e
 * para o leitor de tela. As linhas deduzidas das transferências antigas dizem
 * que são deduzidas.
 */
export function AtividadeDaTransferencia({ itens }: { itens: ItemNaTela[] }) {
  if (itens.length === 0) return <p className="text-ui text-fg-muted">Nada por aqui ainda.</p>;
  return (
    <ol aria-label="Atividade da transferência" className="space-y-3">
      {itens.map((item) => {
        if (item.tipo === "COMMENT" && item.autor) {
          return (
            <li key={item.chave} className="flex gap-2.5">
              <span className="mt-0.5 inline-flex shrink-0">
                <AvatarImage src={item.autor.foto} name={item.autor.nome} size={30} fontSize={11} />
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-3">
                <p className="mb-1 flex flex-wrap items-center gap-x-2 text-helper text-fg-muted">
                  <span className="font-semibold text-fg">{item.autor.nome}</span>
                  {item.setorDoAutor && <span>{item.setorDoAutor}</span>}
                  <Quando item={item} />
                </p>
                {item.trechos && (
                  <p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">
                    <Texto trechos={item.trechos} />
                  </p>
                )}
              </div>
            </li>
          );
        }
        const Icone = ICONE[item.tipo];
        return (
          <li key={item.chave} className="flex items-start gap-2.5 pl-1 text-helper text-fg-secondary">
            <span
              aria-hidden
              className={`mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full ${COR_DO_ICONE[item.tipo] ?? "bg-surface-hover text-fg-muted"}`}
            >
              <Icone size={13} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="break-words">
                  {item.autor && <span className="font-semibold text-fg">{item.autor.nome} </span>}
                  {item.frase}
                  {item.autor && item.setorDoAutor && <span className="text-fg-muted"> · {item.setorDoAutor}</span>}
                </span>
                <Quando item={item} />
                {item.deduzido && (
                  <span className="text-micro text-fg-muted italic" title={DEDUZIDO}>
                    (antes do histórico)
                    <span className="sr-only">: {DEDUZIDO}</span>
                  </span>
                )}
              </p>
              {item.trechos && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-fg-muted">
                  {item.rotuloDoTexto && <span className="font-semibold text-fg-secondary">{item.rotuloDoTexto}: </span>}
                  <Texto trechos={item.trechos} />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
