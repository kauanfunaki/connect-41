import { CheckCircle2, Scale } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { moeda } from "@/lib/contabil-core/tela";
import type { Divergencias } from "@/lib/contabil-core/painel/painel";

// "Conflitos e qualidade" (Bloco D, Fase D1, 26/11/2026): a `ConflitosQualidadeTab` da página Classificação do
// original, aqui como a segunda vista da aba NEO. Quando uma regra classifica, o NEO mede em paralelo a conta
// que a contraparte daria (o modo sombra) e grava se as duas divergem; esta vista resume essa medição: quantas
// classificações foram medidas, quantas divergiram, o valor envolvido, os pares de contas e uma amostra dos
// maiores valores. Só mostra.

const TH = "py-2 pr-3 font-medium";
const CABECALHO = "text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left";
const LINHA = "border-b border-border last:border-0 align-top";
const NUMERO = new Intl.NumberFormat("pt-BR");
const PCT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

const conta = (codigo: string | null, descricao: string | null) => (codigo || descricao ? [codigo, descricao].filter(Boolean).join(" — ") : "Sem conta identificada");

const ORIGEM: Record<string, string> = { nota_fiscal: "Nota fiscal", comprovante: "Comprovante", historico: "Documento no histórico", nome: "Nome no histórico" };

export function ConflitosQualidade({ d }: { d: Divergencias }) {
  if (d.totalAvaliadas === 0) {
    return (
      <EmptyState
        icon={<Scale size={28} aria-hidden />}
        title="Ainda não há medição nesta seleção"
        description="A medição acontece quando o NEO classifica por regra uma transação cuja contraparte também tem conta: processe o NEO para acumular avaliações."
      />
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Classificações avaliadas" value={d.totalAvaliadas} />
        <MetricCard label="Classificações divergentes" value={d.totalDivergentes} tom={d.totalDivergentes ? "atencao" : "ok"} />
        <MetricCard label="Percentual divergente" value={`${PCT.format(d.percentualDivergentes)}%`} />
        <MetricCard label="Valor total envolvido" value={moeda(d.valorTotalDivergente)} destaque />
      </div>

      {d.totalDivergentes === 0 ? (
        <Aviso tom="sucesso" icone={<CheckCircle2 size={16} aria-hidden />}>
          Nenhum conflito nas classificações medidas: {NUMERO.format(d.totalAvaliadas)} avaliadas nesta seleção.
        </Aviso>
      ) : (
        <>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Conflitos por par de contas</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className={CABECALHO}>
                    <th className={TH}>Conta pela regra</th>
                    <th className={TH}>Conta pela contraparte</th>
                    <th className={`${TH} text-right`}>Quantidade</th>
                    <th className={`${TH} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porConta.map((p) => (
                    <tr key={`${p.contaRegraId}-${p.contaContraparteId}`} className={LINHA}>
                      <td className="py-2 pr-3">{conta(p.contaRegraCodigo, p.contaRegraDescricao)}</td>
                      <td className="py-2 pr-3">{conta(p.contaContraparteCodigo, p.contaContraparteDescricao)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{NUMERO.format(p.quantidade)}</td>
                      <td className="py-2 text-right font-medium tabular-nums whitespace-nowrap">{moeda(p.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Amostra para conferência (os maiores valores)</h3>
            {d.amostra.length === 0 ? (
              <p className="text-sm text-fg-muted">A medição registrou conflitos, mas nenhum deles tem as duas contas para mostrar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className={CABECALHO}>
                      <th className={TH}>Histórico</th>
                      <th className={TH}>Evidência</th>
                      <th className={TH}>Conta pela regra</th>
                      <th className={TH}>Conta pela contraparte</th>
                      <th className={`${TH} text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.amostra.map((a) => (
                      <tr key={a.decisaoId} className={LINHA}>
                        <td className="py-2 pr-3 max-w-[280px] break-words">{a.historico || "—"}</td>
                        <td className="py-2 pr-3">{a.origemEvidencia ? (ORIGEM[a.origemEvidencia] ?? a.origemEvidencia) : "—"}</td>
                        <td className="py-2 pr-3">{conta(a.contaRegraCodigo, a.contaRegraDescricao)}</td>
                        <td className="py-2 pr-3">{conta(a.contaContraparteCodigo, a.contaContraparteDescricao)}</td>
                        <td className="py-2 text-right font-medium tabular-nums whitespace-nowrap">{moeda(a.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
