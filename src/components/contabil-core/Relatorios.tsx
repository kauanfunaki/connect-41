import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { Selo } from "@/components/ui/Selo";
import { FileText } from "lucide-react";
import { formatCalendarDate } from "@/lib/format";
import { moeda, ROTULO_DO_TIPO_DE_CONTA } from "@/lib/contabil-core/tela";
import type { Balancete, Dre, LivroCaixa } from "@/lib/contabil-core/relatorios/relatorios";

// Os relatórios do Contábil Core (Bloco D, Fase D2, 26/11/2026): a página `Relatorios` do original (a DRE, o
// Balancete de Verificação e o Livro Caixa), como uma aba do módulo. Só mostra: os números vêm do servidor
// (`servidor/relatorios.ts`), já somados e com o dinheiro em decimal exato (texto de duas casas).

const TH = "py-2 pr-3 font-medium";
const CABECALHO = "text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left";
const LINHA = "border-b border-border last:border-0 align-top";
const negativo = (v: string) => v.startsWith("-");

export function DreDaEmpresa({ r }: { r: Dre }) {
  const positivo = !negativo(r.resultadoLiquido);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Receitas" value={moeda(r.totalReceitas)} />
        <MetricCard label="Custos" value={moeda(r.totalCustos)} />
        <MetricCard label="Despesas" value={moeda(r.totalDespesas)} />
        <MetricCard label="Resultado líquido" value={moeda(r.resultadoLiquido)} tom={positivo ? "ok" : "critico"} />
      </div>
      {r.grupos.length === 0 && <p className="text-sm text-fg-muted">Nenhum lançamento encontrado no período.</p>}
      {r.grupos.map((g) => (
        <div key={g.tipo} className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="mb-1 text-left">
              <span className="flex items-center justify-between font-semibold">
                <span>{g.label}</span>
                <span className="tabular-nums">{moeda(g.total)}</span>
              </span>
            </caption>
            <thead>
              <tr className={CABECALHO}>
                <th className={`${TH} w-32`}>Código</th>
                <th className={TH}>Descrição</th>
                <th className={`${TH} text-right`}>Débitos</th>
                <th className={`${TH} text-right`}>Créditos</th>
                <th className={`${TH} text-right`}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {g.linhas.map((l) => (
                <tr key={l.contaId} className={LINHA}>
                  <td className="py-2 pr-3 font-mono text-micro text-fg-muted">{l.codigo}</td>
                  <td className="py-2 pr-3">{l.descricao}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap text-fg-muted">{moeda(l.debitos)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap text-fg-muted">{moeda(l.creditos)}</td>
                  <td className={`py-2 text-right tabular-nums whitespace-nowrap font-medium ${negativo(l.saldo) ? "text-danger" : "text-success-fg"}`}>{moeda(l.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function BalanceteDaEmpresa({ r }: { r: Balancete }) {
  if (r.linhas.length === 0) return <p className="text-sm text-fg-muted">Nenhuma conta encontrada.</p>;
  const traco = (v: string) => (v === "0.00" ? "—" : moeda(v));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className={CABECALHO}>
            <th className={`${TH} w-40`}>Código</th>
            <th className={TH}>Descrição</th>
            <th className={TH}>Tipo</th>
            <th className={`${TH} text-right`}>Débitos</th>
            <th className={`${TH} text-right`}>Créditos</th>
            <th className={`${TH} text-right`}>Saldo devedor</th>
            <th className={`${TH} text-right`}>Saldo credor</th>
          </tr>
        </thead>
        <tbody>
          {r.linhas.map((l) => (
            <tr key={l.contaId} className={LINHA}>
              {/* O recuo pelo nível do código, como o original; a sintética não soma as analíticas. */}
              <td className="py-2 pr-3 font-mono text-micro text-fg-muted" style={{ paddingLeft: `${(l.nivel - 1) * 12}px` }}>
                {l.codigo}
              </td>
              <td className={`py-2 pr-3 ${l.nivel === 1 ? "font-semibold" : ""}`}>{l.descricao}</td>
              <td className="py-2 pr-3 text-micro text-fg-muted">{ROTULO_DO_TIPO_DE_CONTA[l.tipo] ?? l.tipo}</td>
              <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(l.debitos)}</td>
              <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(l.creditos)}</td>
              <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium">{traco(l.saldoDevedor)}</td>
              <td className="py-2 text-right tabular-nums whitespace-nowrap font-medium">{traco(l.saldoCredor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td colSpan={3} className="py-2 pr-3">
              Totais
            </td>
            <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(r.totalDebitos)}</td>
            <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(r.totalCreditos)}</td>
            <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(r.totalSaldoDevedor)}</td>
            <td className="py-2 text-right tabular-nums whitespace-nowrap">{moeda(r.totalSaldoCredor)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function LivroCaixaDaEmpresa({ r }: { r: LivroCaixa }) {
  if (r.agencias.length === 0) {
    return <EmptyState icon={<FileText size={28} aria-hidden />} title="Nenhuma conta bancária cadastrada" description="O Livro Caixa percorre o extrato de cada conta bancária." />;
  }
  return (
    <div className="flex flex-col gap-8">
      {r.agencias.map((a) => (
        <section key={a.agenciaId}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{a.descricao}</h3>
            <p className="text-micro text-fg-muted">
              Saldo inicial: <strong className="tabular-nums text-fg">{moeda(a.saldoInicial)}</strong> · Saldo final:{" "}
              <strong className={`tabular-nums ${negativo(a.saldoFinal) ? "text-danger" : "text-success-fg"}`}>{moeda(a.saldoFinal)}</strong>
            </p>
          </div>
          {a.lancamentos.length === 0 ? (
            <p className="text-sm text-fg-muted">Sem movimentações no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className={CABECALHO}>
                    <th className={TH}>Data</th>
                    <th className={TH}>Histórico</th>
                    <th className={`${TH} text-center`}>D/C</th>
                    <th className={`${TH} text-right`}>Valor</th>
                    <th className={`${TH} text-right`}>Saldo acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {a.lancamentos.map((l, i) => (
                    <tr key={i} className={LINHA}>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatCalendarDate(new Date(`${l.data}T00:00:00.000Z`))}</td>
                      <td className="py-2 pr-3">{l.historico}</td>
                      <td className="py-2 pr-3 text-center">
                        <Selo tom={l.dc === "C" ? "sucesso" : "perigo"}>{l.dc}</Selo>
                      </td>
                      <td className={`py-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium ${l.dc === "C" ? "text-success-fg" : "text-danger"}`}>{moeda(l.valor)}</td>
                      <td className={`py-2 text-right tabular-nums whitespace-nowrap ${negativo(l.saldoAcumulado) ? "text-danger" : ""}`}>{moeda(l.saldoAcumulado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border text-micro font-semibold">
                    <td colSpan={3} className="py-2 pr-3">
                      Totais do período
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap text-danger">{moeda(a.totalDebitos)} D</td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap text-success-fg">{moeda(a.totalCreditos)} C</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
