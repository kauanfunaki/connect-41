import Link from "next/link";
import { Briefcase, FileSignature, HandCoins, KeyRound, ListTodo, MessageSquareWarning, Palmtree, Receipt, Stethoscope } from "lucide-react";
import type { PrazoDaAgenda, TipoDePrazo } from "@/lib/prazosDaAgenda";

/** Nome e cor de cada setor, do cadastro do tenant. */
export type SetoresDaAgenda = Record<string, { rotulo: string; cor: string }>;

const ICONE: Record<TipoDePrazo, React.ReactNode> = {
  tarefa: <ListTodo />,
  "conta-pagar": <Receipt />,
  "conta-receber": <HandCoins />,
  pendencia: <MessageSquareWarning />,
  processo: <FileSignature />,
  ferias: <Palmtree />,
  exame: <Stethoscope />,
  vaga: <Briefcase />,
  certificado: <KeyRound />,
};

/**
 * Um prazo no calendário: etiqueta de dia inteiro, na cor do setor que
 * responde por ele, com o ícone do tipo. Clicar leva à tela do prazo (ou à
 * lista, quando a etiqueta junta vários).
 */
export function PrazoItem({ prazo, setores }: { prazo: PrazoDaAgenda; setores: SetoresDaAgenda }) {
  const setor = setores[prazo.setor];
  const cor = setor?.cor ?? "#586577";
  const dica = [prazo.titulo, [prazo.detalhe, setor?.rotulo].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
  return (
    <Link
      href={prazo.href}
      data-dica={dica}
      className="flex w-full min-w-0 items-center gap-1 h-5 pl-1 pr-1.5 rounded-[4px] border-l-2 text-[11px] leading-none text-fg hover:brightness-95 dark:hover:brightness-125 transition-[filter]"
      style={{ borderLeftColor: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}
    >
      <span className="flex-shrink-0 [&>svg]:size-[11px]" style={{ color: cor }} aria-hidden>
        {ICONE[prazo.tipo]}
      </span>
      <span className="truncate font-medium">{prazo.titulo}</span>
      {prazo.quantos > 1 && prazo.detalhe && <span className="flex-shrink-0 text-fg-muted">· {prazo.detalhe}</span>}
    </Link>
  );
}
