import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatInstantDate } from "@/lib/format";
import type { LinhaDaFila } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADE_LABEL, PRIORIDADE_VARIANTE } from "@/lib/societario/prioridade";
import { prazoCombinado } from "@/lib/societario/dados-do-processo";
import { DIAS_DE_CONCLUIDOS_RECENTES } from "@/lib/societario/prazos";
import { PrazoCelula, SITUACAO_LABEL } from "./ProcessosFila";

const COR_DO_PRAZO_COMBINADO = {
  vencido: "text-danger font-medium",
  hoje: "text-danger font-medium",
  proximo: "text-warning",
  folga: "text-fg-muted",
} as const;

type Props = {
  colunas: { situacao: SituacaoDoProcesso; linhas: LinhaDaFila[] }[];
  agora: Date;
};

/**
 * O kanban dos processos.
 *
 * **Sem arrastar.** A coluna é a situação derivada dos protocolos — mover um
 * cartão de "Aguardando órgão" para "Em andamento" não mudaria o que o órgão
 * respondeu, só faria a tela mentir. Para mudar de coluna, registra-se o
 * desfecho no processo.
 */
export function KanbanDeProcessos({ colunas, agora }: Props) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-full">
        {colunas.map((coluna) => (
          <section key={coluna.situacao} className="flex flex-col gap-2 rounded-lg bg-surface-hover/40 p-2">
            <header className="flex items-baseline justify-between px-1 pt-1">
              <h2 className="text-[13px] font-semibold text-fg">{SITUACAO_LABEL[coluna.situacao]}</h2>
              <span className="text-[12px] tabular-nums text-fg-muted">{coluna.linhas.length}</span>
            </header>
            {coluna.situacao === "CONCLUIDO" && (
              <p className="px-1 text-[11px] text-fg-muted">Últimos {DIAS_DE_CONCLUIDOS_RECENTES} dias</p>
            )}

            {coluna.linhas.length === 0 ? (
              <p className="px-1 py-6 text-center text-[12px] text-fg-muted">Nenhum processo</p>
            ) : (
              coluna.linhas.map((l) => {
                const combinado =
                  l.prazoCombinado && l.situacao !== "CONCLUIDO" ? prazoCombinado(l.prazoCombinado, agora) : null;
                return (
                  <Link
                    key={l.id}
                    href={`/processos/${l.id}`}
                    className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3 hover:border-brand/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-semibold leading-snug line-clamp-2">{l.empresaNome}</span>
                      {l.prioridade !== "NORMAL" && (
                        <Badge variant={PRIORIDADE_VARIANTE[l.prioridade]}>{PRIORIDADE_LABEL[l.prioridade]}</Badge>
                      )}
                    </div>
                    <span className="text-[12px] text-fg-secondary truncate">
                      {l.tipoNome}
                      {l.titulo && ` — ${l.titulo}`}
                    </span>
                    <PrazoCelula prazo={l.prazo} />
                    {combinado && l.prazoCombinado && (
                      <span className={`text-[11px] ${COR_DO_PRAZO_COMBINADO[combinado.situacao]}`}>
                        {combinado.texto} · {formatInstantDate(l.prazoCombinado)}
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
                      <span className="truncate">{l.responsavelNome ?? "sem responsável"}</span>
                      {l.voltas > 0 && (
                        <span className="inline-flex items-center gap-1 text-danger whitespace-nowrap">
                          <AlertCircle size={11} />
                          {l.voltas} {l.voltas === 1 ? "volta" : "voltas"}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
