// A aba "Cenário" do Fluxo de caixa, na equipe e no portal (26/11/2026,
// funcionalidade-838, a opção D da página de decisão).
//
// O saldo no fim de cada mês, previsto e com as premissas, em duas linhas e
// na tabela embaixo: as vendas do mês (a base do %), cada premissa, o total e
// o saldo com premissas. O previsto não muda; o cenário é uma conta à parte.

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";
import { ROTULO_DO_TIPO, type Cenario } from "@/lib/fluxoDeCaixa/cenario";
import type { DadosDoCenario } from "@/lib/fluxoDeCaixa/previstoServidor";

const REAIS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const valor = (centavos: number) => {
  const r = Math.round(centavos / 100);
  return r === 0 ? "—" : REAIS.format(r).replace("-", "−");
};
const tom = (c: number) => (c < 0 ? "text-danger" : "text-fg");

/** Duas linhas no mesmo eixo (mesma grandeza, reais), com o zero marcado. */
function GraficoDoCenario({ cenario }: { cenario: Cenario }) {
  const a = cenario.saldoPrevisto;
  const b = cenario.saldoComPremissas;
  const todos = [...a, ...b, 0];
  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const faixa = max - min || 1;
  const n = a.length;
  const x = (i: number) => 4 + (i / Math.max(n - 1, 1)) * 92;
  const y = (v: number) => 8 + (1 - (v - min) / faixa) * 80;
  const caminho = (s: number[]) => s.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-fs-2">
        <li className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: "var(--c41-brand)" }} aria-hidden />
          <span className="text-fg-secondary">Previsto</span>
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0 border-t-2 border-dashed" style={{ borderColor: "var(--c41-warning)" }} aria-hidden />
          <span className="text-fg-secondary">Com as premissas</span>
        </li>
      </ul>
      <svg viewBox="0 0 100 96" preserveAspectRatio="none" className="w-full h-48" aria-hidden>
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--c41-border-strong)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        <path d={caminho(a)} fill="none" stroke="var(--c41-brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={caminho(b)} fill="none" stroke="var(--c41-warning)" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-micro text-fg-muted mt-1" aria-hidden>
        {cenario.periodos.map((p) => (
          <span key={p.chave}>{p.rotulo.split(" ")[0]}</span>
        ))}
      </div>
    </div>
  );
}

export function CenarioDoFluxo({ dados, noPortal = false }: { dados: DadosDoCenario; noPortal?: boolean }) {
  const { cenario } = dados;
  const apoio = noPortal ? "text-ui" : "text-helper";
  if (dados.premissas.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhuma premissa no cenário"
          description={
            noPortal
              ? "A equipe da 41 ainda não cadastrou as premissas do seu cenário."
              : "Cadastre as premissas (custo fixo por mês ou % das vendas) em Modelo do fluxo › Pedidos de venda e cenário."
          }
        />
      </Card>
    );
  }
  const n = cenario.periodos.length;
  const fimPrevisto = cenario.saldoPrevisto[n - 1] ?? 0;
  const fimCom = cenario.saldoComPremissas[n - 1] ?? 0;
  const linhas: { rotulo: string; valores: number[]; forte?: boolean; apoio?: boolean; saldo?: boolean }[] = [
    { rotulo: "Saldo previsto no fim do mês", valores: cenario.saldoPrevisto, saldo: true },
    { rotulo: "Vendas do mês (base do %)", valores: cenario.vendas, apoio: true },
    ...cenario.premissas.map((p) => ({ rotulo: `${p.nome} · ${p.tipo === "fixo" ? `R$ ${REAIS.format(p.valor)}/mês` : `${String(p.valor).replace(".", ",")}%`}`, valores: p.valores })),
    { rotulo: "Total das premissas", valores: cenario.totalDasPremissas, forte: true },
    { rotulo: "Saldo com as premissas", valores: cenario.saldoComPremissas, forte: true, saldo: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <p className={`${apoio} text-fg-muted`}>Saldo em 12 meses, previsto</p>
          <p className={`text-section font-semibold tabular-nums mt-0.5 ${tom(fimPrevisto)}`}>{moeda(fimPrevisto)}</p>
        </Card>
        <Card className="p-3">
          <p className={`${apoio} text-fg-muted`}>Saldo em 12 meses, com as premissas</p>
          <p className={`text-section font-semibold tabular-nums mt-0.5 ${tom(fimCom)}`}>{moeda(fimCom)}</p>
          <p className={`${apoio} text-fg-muted`}>{moeda(fimCom - fimPrevisto)} de diferença</p>
        </Card>
        <Card className="p-3">
          <p className={`${apoio} text-fg-muted`}>Menor saldo do mês, com as premissas</p>
          {cenario.menorComPremissas && (
            <>
              <p className={`text-section font-semibold tabular-nums mt-0.5 ${tom(cenario.menorComPremissas.centavos)}`}>{moeda(cenario.menorComPremissas.centavos)}</p>
              <p className={`${apoio} text-fg-muted`}>no fim de {cenario.menorComPremissas.periodo.rotulo}</p>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <GraficoDoCenario cenario={cenario} />
      </Card>

      <div className="overflow-x-auto border border-border rounded-lg bg-surface shadow-xs">
        <table className="w-full text-fs-2 border-collapse">
          <caption className="sr-only">Cenário mês a mês, em reais: o saldo previsto, as premissas e o saldo com as premissas</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-surface-2 text-left font-medium text-micro uppercase tracking-wide text-fg-muted px-3 py-2 border-b border-border min-w-[15rem]">
                R$
              </th>
              {cenario.periodos.map((p) => (
                <th key={p.chave} scope="col" className="px-3 py-2 text-right font-medium text-micro uppercase tracking-wide border-b border-border whitespace-nowrap bg-surface-2 text-fg-muted">
                  {p.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className={l.saldo && l.forte ? "border-t-2 border-border-strong" : "border-t border-border-soft"}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 text-left px-3 py-2 ${l.saldo && l.forte ? "bg-surface-hover font-semibold text-fg" : l.forte ? "bg-surface font-medium text-fg" : l.apoio ? "bg-surface font-normal text-fg-muted" : "bg-surface font-normal text-fg-secondary"}`}
                >
                  {l.rotulo}
                </th>
                {l.valores.map((v, i) => (
                  <td
                    key={cenario.periodos[i]!.chave}
                    className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${l.forte ? "font-semibold" : ""} ${v < 0 ? "text-danger" : l.apoio || v === 0 ? "text-fg-muted" : "text-fg"} ${
                      l.saldo && l.forte ? (v < 0 ? "bg-danger-bg" : "bg-surface-hover") : ""
                    }`}
                  >
                    {valor(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NotaDeFonte>
        As premissas são custos que ainda não são conta lançada. O previsto não muda: o cenário soma as premissas ao saldo previsto, mês a mês.
        {` ${ROTULO_DO_TIPO.percentual}: a base é o que entra de clientes e de pedidos no mês.`}
      </NotaDeFonte>
    </div>
  );
}
