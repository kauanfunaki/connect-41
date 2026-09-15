import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { faixasDeAtraso, rankingDeContrapartes, type ContaParaAnalise } from "@/lib/financeiro/analise";
import { moeda, percentual } from "@/lib/financeiro/formato";

const CABECALHO = "text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border";

/**
 * Faixas de atraso e ranking — a aba de análise de `/pagar` e `/receber`.
 *
 * Recebe as mesmas linhas da lista, no recorte "em aberto": a soma das faixas
 * tem de bater com o número do topo da tela, e só bate se as duas vierem da
 * mesma consulta.
 */
export function AnaliseDeContas({ linhas, hojeKey, aPagar }: { linhas: ContaParaAnalise[]; hojeKey: string; aPagar: boolean }) {
  const faixas = faixasDeAtraso(linhas, hojeKey);
  const ranking = rankingDeContrapartes(linhas, 10);
  const total = faixas.reduce((n, f) => n + f.centavos, 0);

  if (total === 0) {
    return <EmptyState title="Nada em aberto para analisar" icon={<BarChart3 />} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h2 className="text-[14px] font-semibold text-fg mb-2">Faixas de atraso</h2>
        <div className="border border-border rounded-lg bg-surface overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className={CABECALHO}>
                <th className="py-2 pl-4 pr-3 font-medium">Faixa</th>
                <th className="py-2 pr-3 font-medium text-right">Contas</th>
                <th className="py-2 pr-3 font-medium text-right">Valor</th>
                <th className="py-2 pr-4 font-medium w-[30%]"></th>
              </tr>
            </thead>
            <tbody>
              {faixas.map((f) => (
                <tr key={f.chave} className="border-b border-border-soft">
                  <td className={`py-2 pl-4 pr-3 ${f.chave === "a_vencer" ? "text-fg-secondary" : "text-danger"}`}>{f.rotulo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.quantidade}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium">{moeda(f.centavos)}</td>
                  <td className="py-2 pr-4">
                    <div className="h-2 rounded bg-border-soft overflow-hidden" aria-hidden>
                      <div
                        className={`h-full ${f.chave === "a_vencer" ? "bg-info" : "bg-danger"}`}
                        style={{ width: `${(f.centavos / total) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[14px] font-semibold text-fg mb-2">{aPagar ? "Maiores fornecedores em aberto" : "Maiores clientes em aberto"}</h2>
        <div className="border border-border rounded-lg bg-surface overflow-x-auto">
          <table className="w-full min-w-[460px] text-[13px]">
            <thead>
              <tr className={CABECALHO}>
                <th className="py-2 pl-4 pr-3 font-medium">{aPagar ? "Fornecedor" : "Cliente"}</th>
                <th className="py-2 pr-3 font-medium text-right">Em aberto</th>
                <th className="py-2 pr-3 font-medium text-right">Vencido</th>
                <th className="py-2 pr-4 font-medium text-right">Participação</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.contraparteNome} className="border-b border-border-soft">
                  <td className="py-2 pl-4 pr-3">
                    <span className="font-medium">{r.contraparteNome}</span>
                    <span className="block text-[11px] text-fg-muted">
                      {r.quantidade} {r.quantidade === 1 ? "conta" : "contas"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(r.emAberto)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${r.vencido > 0 ? "text-danger" : "text-fg-muted"}`}>{moeda(r.vencido)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{percentual(r.participacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-fg-muted mt-2">
          Vence hoje conta como a vencer. Cobrança e régua de inadimplência são outra etapa; esta aba só mostra onde está o
          dinheiro parado.
        </p>
      </section>
    </div>
  );
}
