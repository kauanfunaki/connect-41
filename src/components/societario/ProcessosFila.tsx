import Link from "next/link";
import { AlertCircle, Clock, Play } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate } from "@/lib/format";
import type { LinhaDaFila } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADE_LABEL, PRIORIDADE_VARIANTE } from "@/lib/societario/prioridade";
import { prazoCombinado } from "@/lib/societario/dados-do-processo";

export const SITUACAO_LABEL: Record<SituacaoDoProcesso, string> = {
  EM_EXIGENCIA: "Em exigência",
  AGUARDANDO_ORGAO: "Aguardando órgão",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  SUSPENSO: "Suspenso",
  CONCLUIDO: "Concluído",
};

// Cor por situação, e não uma cor só: quem abre esta tela precisa achar a
// exigência sem ler. Atenção é o que depende de gente; informação é o que
// depende do órgão.
export const SITUACAO_VARIANTE: Record<SituacaoDoProcesso, "danger" | "info" | "success" | "warning"> = {
  EM_EXIGENCIA: "warning",
  AGUARDANDO_ORGAO: "info",
  EM_ANDAMENTO: "success",
  AGUARDANDO_CLIENTE: "info",
  SUSPENSO: "danger",
  CONCLUIDO: "success",
};

const COR_DO_PRAZO_COMBINADO = {
  vencido: "text-danger font-medium",
  hoje: "text-danger font-medium",
  proximo: "text-warning",
  folga: "text-fg-muted",
} as const;

/**
 * O prazo em uma frase.
 *
 * "sem previsão" não é falta de dado — é o alvará, que o próprio setor declara
 * como fluxo variável. Escrever "0 de 0 dias" ali seria inventar régua.
 */
export function PrazoCelula({ prazo }: { prazo: LinhaDaFila["prazo"] }) {
  if (prazo.situacao === "sem_previsao") {
    return (
      <span className="text-[12px] text-fg-muted">
        {prazo.dias} {prazo.dias === 1 ? "dia útil" : "dias úteis"} · sem previsão
      </span>
    );
  }
  const cor =
    prazo.situacao === "estourado"
      ? "text-danger"
      : prazo.situacao === "no_limite"
        ? "text-warning"
        : "text-fg-secondary";
  const faixa =
    prazo.previstoMin !== null && prazo.previstoMin !== prazo.previstoMax
      ? `${prazo.previstoMin}–${prazo.previstoMax}`
      : String(prazo.previstoMax);
  return (
    <span className={`text-[12px] font-medium ${cor}`}>
      <span className="tabular-nums">{prazo.dias}</span> de{" "}
      <span className="tabular-nums">{faixa}</span> dias úteis
      {prazo.situacao === "estourado" && " · estourado"}
    </span>
  );
}

type Props = {
  linhas: LinhaDaFila[];
  /** Há processos no setor, mas nenhum passou pelo filtro atual. */
  filtrado: boolean;
  /** Agora, do servidor — o prazo combinado conta dias no fuso de São Paulo. */
  agora: Date;
};

export function ProcessosFila({ linhas, filtrado, agora }: Props) {
  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nenhum processo neste filtro"
        description="Troque o recorte ou limpe os filtros acima para ver os outros."
        icon={<Clock />}
      />
    ) : (
      <EmptyState
        title="Nenhum processo aberto"
        description="Constituição, alteração contratual, baixa e alvará aparecem aqui assim que forem abertos."
        icon={<Play />}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {linhas.map((l) => {
        const combinado = l.prazoCombinado ? prazoCombinado(l.prazoCombinado, agora) : null;
        return (
          <Link
            key={l.id}
            href={`/processos/${l.id}`}
            className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-2 px-1 py-3.5 border-b border-border-soft hover:bg-surface-hover transition-colors"
          >
            <div className="min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold truncate">{l.empresaNome}</span>
                <span className="text-[12px] text-fg-muted">{l.tipoNome}</span>
                {/* Normal é o caso comum e não ganha selo: selo em toda linha
                    deixa de chamar atenção onde importa. */}
                {l.prioridade !== "NORMAL" && (
                  <Badge variant={PRIORIDADE_VARIANTE[l.prioridade]}>{PRIORIDADE_LABEL[l.prioridade]}</Badge>
                )}
                {/* A volta só aparece quando existe: "0 voltas" em toda linha
                    vira ruído e some justamente onde deveria chamar atenção. */}
                {l.voltas > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-danger">
                    <AlertCircle size={12} />
                    {l.voltas} {l.voltas === 1 ? "volta" : "voltas"}
                  </span>
                )}
              </div>
              {l.titulo && <span className="text-[12px] text-fg-secondary truncate">{l.titulo}</span>}
              <span className="text-[12px] text-fg-muted truncate">
                {l.etapasAgora.length > 0 ? l.etapasAgora.join(" · ") : "Nada liberado no roteiro"}
              </span>
            </div>

            <div className="flex items-center gap-4 md:justify-end flex-wrap">
              <div className="flex flex-col items-start md:items-end gap-0.5">
                <PrazoCelula prazo={l.prazo} />
                {combinado && l.prazoCombinado && (
                  <span className={`text-[11px] whitespace-nowrap ${COR_DO_PRAZO_COMBINADO[combinado.situacao]}`}>
                    {combinado.texto} · {formatInstantDate(l.prazoCombinado)}
                  </span>
                )}
              </div>
              <Badge variant={SITUACAO_VARIANTE[l.situacao]}>{SITUACAO_LABEL[l.situacao]}</Badge>
              <span className="hidden lg:inline text-[12px] text-fg-muted whitespace-nowrap">
                {l.responsavelNome ?? "sem responsável"}
              </span>
              <span className="hidden xl:inline text-[12px] text-fg-muted whitespace-nowrap tabular-nums">
                {formatInstantDate(l.iniciadoEm)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
