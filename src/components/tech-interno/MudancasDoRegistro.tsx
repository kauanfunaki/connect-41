import { Fragment } from "react";
import { ArrowRight, CalendarClock, CircleDot, Flag, Link2, PencilLine, Server, Tag, TextAlignStart, Type, User, type LucideIcon } from "lucide-react";
import { SITUACOES, diaLegivel, fraseDaAlteracao, type Alteracao } from "@/lib/tech-interno/regras";
import { CORES_DA_SITUACAO } from "@/lib/tech-interno/cores";

// O que mudou num registro do histórico, campo a campo (29/10/2026): o ícone do
// campo, o valor de antes riscado e o novo ao lado. A situação leva a cor dela,
// a mesma da lista e do Kanban. Na criação, só os valores preenchidos.
const ICONE_DO_CAMPO: Record<string, LucideIcon> = {
  "Título": Type, "Descrição": TextAlignStart, "Tipo": Tag, "Prioridade": Flag, "Situação": CircleDot,
  "Sistema": Server, "Responsável": User, "Prazo": CalendarClock, "Vínculo do sistema": Link2, "Vínculo do responsável": Link2,
};
const ROTULO_DO_CAMPO: Record<string, string> = { "Vínculo do sistema": "Sistema", "Vínculo do responsável": "Responsável" };

function Valor({ campo, valor, antes = false }: { campo: string; valor: string | null; antes?: boolean }) {
  if (valor === null) return <span className="text-fg-muted italic">vazio</span>;
  const situacao = campo === "Situação" ? Object.entries(SITUACOES).find(([, r]) => r === valor)?.[0] as keyof typeof SITUACOES | undefined : undefined;
  if (situacao) {
    const cor = CORES_DA_SITUACAO[situacao];
    return <span className={`inline-block rounded px-1.5 py-px font-semibold ${antes ? "opacity-55" : ""}`} style={{ backgroundColor: cor.fundo, color: cor.tinta }}>{valor}</span>;
  }
  return <span className={antes ? "text-fg-muted line-through decoration-fg-muted/60" : "font-medium text-fg"}>{diaLegivel(valor)}</span>;
}

export function MudancasDoRegistro({ changes, criacao = false }: { changes: Alteracao[]; criacao?: boolean }) {
  const linhas = changes.filter(c => !criacao || c.after);
  if (!linhas.length) return null;
  return <dl className="mt-2 grid grid-cols-1 items-baseline gap-x-4 gap-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-helper">
    {linhas.map(c => {
      const Icone = ICONE_DO_CAMPO[c.field] ?? PencilLine;
      // Descrição e trocas de cadastro com o mesmo nome não cabem em "antes → depois".
      const emFrase = c.field === "Descrição" || c.field.startsWith("Vínculo");
      return <Fragment key={c.field}>
        <dt className="flex items-center gap-1.5 whitespace-nowrap text-fg-secondary [&:not(:first-child)]:mt-1.5 sm:[&:not(:first-child)]:mt-0"><Icone size={13} aria-hidden className="shrink-0" />{ROTULO_DO_CAMPO[c.field] ?? c.field}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 break-words [overflow-wrap:anywhere]">
          {emFrase ? <span className="text-fg">{criacao ? "preenchida" : fraseDaAlteracao(c)}</span>
            : criacao ? <Valor campo={c.field} valor={c.after} />
            : <><Valor campo={c.field} valor={c.before} antes /><ArrowRight size={12} aria-label="para" className="shrink-0 text-fg-muted" /><Valor campo={c.field} valor={c.after} /></>}
        </dd>
      </Fragment>;
    })}
  </dl>;
}
