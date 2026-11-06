import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { ExecutarAnalise, Tolerancia } from "@/components/revisao-contabil/AcoesDaRevisao";
import { tomDoEstado } from "@/components/revisao-contabil/tons";
import { positionNote } from "@/lib/revisao-contabil/motor/relatorio";
import type { Execucao } from "@/lib/revisao-contabil/motor/execucao";
import { formatarReaisDeCentavos, formatInstantDateTime } from "@/lib/format";

type Historico = { id: string; executadaEm: Date; achados: number; versao: string; executadaPorId: string | null };

const POSICAO = [
  ["Ativo", "assets"],
  ["Patrimônio líquido", "equity"],
  ["Receita bruta", "grossRevenue"],
  ["Resultado", "result"],
] as const;

/** A diferença do teste: o R04 conta linhas; o resto é dinheiro em centavos. */
function diferenca(t: Execucao["tests"][number]): string {
  if (t.difference == null) return "Não quantificada";
  return t.id === "R04" ? `${t.difference} linha(s)` : formatarReaisDeCentavos(t.difference);
}

/**
 * Executar a análise e ler o que ela conferiu: a posição identificada e cada
 * teste com estado, diferença, fórmula e fonte. "Confere no escopo" não é
 * aprovação, e teste não executado não equivale a aprovação.
 */
export function AbaAnalise({
  fechamentoId,
  tolerancia,
  documentosAtivos,
  execucao,
  valida,
  historico,
  autores,
  podeAgir,
}: {
  fechamentoId: string;
  tolerancia: number;
  documentosAtivos: number;
  execucao: { id: string; resultado: Execucao } | null;
  valida: boolean;
  historico: Historico[];
  autores: Map<string, string>;
  podeAgir: boolean;
}) {
  const r = execucao?.resultado;
  const resumo = (r?.summary ?? {}) as Record<string, number | undefined>;
  return (
    <div className="flex flex-col gap-4">
      <Card as="section" className="flex flex-wrap items-end justify-between gap-4 p-4">
        <Tolerancia fechamentoId={fechamentoId} centavos={tolerancia} podeAgir={podeAgir} />
        {podeAgir && (
          <div className="flex flex-col items-end gap-1">
            <ExecutarAnalise fechamentoId={fechamentoId} documentos={documentosAtivos} valida={valida} />
            <span className="text-micro text-fg-muted">
              {documentosAtivos === 1 ? "1 documento na análise" : `${documentosAtivos} documentos na análise`}
            </span>
          </div>
        )}
      </Card>

      {!r ? (
        <EmptyState title="Ainda não analisado" description="Confira a leitura dos documentos e execute a análise." />
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-label font-semibold text-fg">Posição identificada</h2>
            <FaixaDeTotais
              destaque={false}
              itens={POSICAO.map(([rotulo, chave]) => ({
                rotulo,
                valor: resumo[chave] == null ? "Não identificado" : formatarReaisDeCentavos(resumo[chave] as number),
                detalhe: positionNote(r.summary, chave).replace(/^ \((.*)\)$/, "$1") || undefined,
              }))}
            />
          </section>

          <Card as="section" className="overflow-x-auto p-4">
            <h2 className="mb-2 text-label font-semibold text-fg">Testes e diferenças</h2>
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Teste</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium text-right">Diferença</th>
                  <th className="py-2 pr-3 font-medium">Fórmula</th>
                  <th className="py-2 font-medium">Fonte e motivo</th>
                </tr>
              </thead>
              <tbody>
                {r.tests.map((t, i) => (
                  <tr key={`${t.id}-${i}`} className="border-b border-border last:border-0 align-top">
                    <td className="py-2.5 pr-3 max-w-[280px]">
                      <span className="font-medium text-fg">{t.id}</span> <span className="break-words">{t.title}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Selo tom={tomDoEstado(t.status)}>{t.status}</Selo>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{diferenca(t)}</td>
                    <td className="py-2.5 pr-3 max-w-[260px] break-words text-helper">{t.formula || "Não aplicável"}</td>
                    <td className="py-2.5 max-w-[320px] break-words text-helper">
                      {t.source}
                      {t.reason && <span className="block text-fg-muted">{t.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {historico.length > 0 && (
        <Card as="section" className="p-4">
          <h2 className="mb-2 text-label font-semibold text-fg">Execuções</h2>
          <ul className="flex flex-col divide-y divide-border">
            {historico.map((h, i) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-ui">
                <span>
                  {formatInstantDateTime(h.executadaEm)}
                  {h.executadaPorId && autores.get(h.executadaPorId) ? ` · ${autores.get(h.executadaPorId)}` : ""} · {h.versao} ·{" "}
                  {h.achados === 1 ? "1 achado" : `${h.achados} achados`}
                  {i === 0 && <span className="ml-2 text-micro text-fg-muted">(a mostrada)</span>}
                </span>
                <a href={`/api/revisao-contabil/execucoes/${h.id}?formato=md`} className="text-button-sm text-brand hover:underline">
                  Relatório .md
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
