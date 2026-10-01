import Link from "next/link";
import { ArrowRightLeft, FileSignature, MessageSquareWarning, SquareKanban } from "lucide-react";
import { SelosDoItem, ORIGEM } from "@/components/gestao/ItemDaGestao";
import type { Classificacao, ItemDeTrabalho, Origem } from "@/lib/gestao/regras";

const ICONE: Record<Origem, React.ReactNode> = {
  PROCESSO: <FileSignature />,
  CARD: <SquareKanban />,
  PENDENCIA: <MessageSquareWarning />,
  TRANSFERENCIA: <ArrowRightLeft />,
};

/**
 * Um item do Meu dia: de onde vem (ícone e rótulo), o setor na cor dele, o
 * que pede atenção e — na visão do time — quem responde.
 */
export function LinhaDoDia({
  item,
  c,
  setor,
  responsaveis,
}: {
  item: ItemDeTrabalho;
  c: Classificacao;
  setor: { rotulo: string; cor: string };
  /** Só na visão do time: os nomes de quem responde (vazio = ninguém). */
  responsaveis?: string[];
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className="mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-hover text-fg-secondary [&>svg]:size-4"
        aria-hidden
      >
        {ICONE[item.origem]}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={item.href} className="block text-[13.5px] font-medium leading-snug text-fg hover:text-brand transition-colors break-words">
          {item.titulo}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-fg-muted">
          <span>{ORIGEM[item.origem]}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full" style={{ background: setor.cor }} aria-hidden />
            {setor.rotulo}
          </span>
          {responsaveis && (
            <>
              <span aria-hidden>·</span>
              <span className={responsaveis.length ? "" : "text-warning"}>{responsaveis.length ? responsaveis.join(", ") : "sem responsável"}</span>
            </>
          )}
          <SelosDoItem c={c} />
        </div>
      </div>
    </li>
  );
}
