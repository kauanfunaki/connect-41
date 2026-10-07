import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { ColunaDoQuadro } from "@/components/kanban/ColunaDoQuadro";
import { formatInstantDate } from "@/lib/format";
import type { LinhaDaFila } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADE_LABEL, PRIORIDADE_VARIANTE } from "@/lib/societario/prioridade";
import { prazoCombinado } from "@/lib/societario/dados-do-processo";
import { DIAS_DE_CONCLUIDOS_RECENTES } from "@/lib/societario/prazos";
import { COR_DO_PRAZO_COMBINADO, PrazoCelula, SITUACAO_LABEL } from "./ProcessosFila";
import { TOM_DA_VARIANTE } from "./tomDoSelo";

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
 *
 * A coluna é a mesma casca do quadro do Kanban (`ColunaDoQuadro`, 07/10/2026),
 * com altura limitada pela tela e rolagem por coluna: a "Em andamento" dos
 * processos vindos do Trello esticava a página inteira.
 */
export function KanbanDeProcessos({ colunas, agora }: Props) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-full">
        {colunas.map((coluna) => (
          <ColunaDoQuadro
            key={coluna.situacao}
            tituloComo="h2"
            titulo={SITUACAO_LABEL[coluna.situacao]}
            contagem={coluna.linhas.length}
            nota={coluna.situacao === "CONCLUIDO" ? `Últimos ${DIAS_DE_CONCLUIDOS_RECENTES} dias` : undefined}
            vazio="Nenhum processo"
            className="max-h-[calc(100dvh-15rem)] min-h-[320px]"
          >
            {coluna.linhas.map((l) => {
              const combinado =
                l.prazoCombinado && l.situacao !== "CONCLUIDO" ? prazoCombinado(l.prazoCombinado, agora) : null;
              return (
                <Link
                  key={l.id}
                  href={`/processos/${l.id}`}
                  className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 hover:border-border-strong hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[length:var(--fs-kanban-title)] font-semibold leading-snug line-clamp-2">{l.empresaNome}</span>
                    {/* Selo, e não Badge: é a situação do cartão (regra de 02/10 no Selo). */}
                    {l.prioridade !== "NORMAL" && (
                      <Selo tom={TOM_DA_VARIANTE[PRIORIDADE_VARIANTE[l.prioridade]]}>{PRIORIDADE_LABEL[l.prioridade]}</Selo>
                    )}
                  </div>
                  <span className="text-[length:var(--fs-kanban-meta)] text-fg-secondary truncate">
                    {l.tipoNome}
                    {l.titulo && ` — ${l.titulo}`}
                  </span>
                  <PrazoCelula prazo={l.prazo} />
                  {combinado && l.prazoCombinado && (
                    <span className={`text-[length:var(--fs-micro)] ${COR_DO_PRAZO_COMBINADO[combinado.situacao]}`}>
                      {combinado.texto} · {formatInstantDate(l.prazoCombinado)}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2 text-[length:var(--fs-micro)] text-fg-muted">
                    <span className="truncate">{l.responsavelNome ?? "Sem responsável"}</span>
                    {l.voltas > 0 && (
                      <span className="inline-flex items-center gap-1 text-danger whitespace-nowrap">
                        <AlertCircle size={12} />
                        {l.voltas} {l.voltas === 1 ? "volta" : "voltas"}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </ColunaDoQuadro>
        ))}
      </div>
    </div>
  );
}
