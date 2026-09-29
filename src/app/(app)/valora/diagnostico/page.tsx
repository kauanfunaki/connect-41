import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { getPrisma } from "@/lib/prisma";
import { acessoAoValora, configDoValora } from "@/lib/valora/servidor";
import { custosDoTenant, horasDoPeriodo, periodoDaUrl } from "@/lib/gestao/horas";
import { diagnosticarCarteira, type PropostaGanha } from "@/lib/gestao/custo";

export const dynamic = "force-dynamic";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

// Diagnóstico da carteira (29/09): a "Calculadora de preço" do 41-gestao, que
// olhava para trás — o custo real das horas apontadas contra o honorário —
// trazida para dentro do Valora, que olha para a frente. Um cálculo, um
// cadastro de custos: o custo da hora é o da equipe no Valora, e o honorário é
// o preço da proposta que o cliente fechou.
export default async function DiagnosticoDaCarteiraPage() {
  const acesso = await acessoAoValora();
  // Custo de equipe e margem são confidenciais, como nos parâmetros.
  if (!acesso || !acesso.podeGerir) notFound();

  const periodo = periodoDaUrl("90d");
  const [ganhas, horas, custos, cfg] = await Promise.all([
    getPrisma().valoraProposta.findMany({
      where: { tenantId: acesso.tenantId, status: "GANHA", companyId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { companyId: true, cliente: true, precoOferecido: true, precoAlvo: true },
    }),
    horasDoPeriodo(acesso.tenantId, "todos", periodo.de, periodo.ate),
    custosDoTenant(acesso.tenantId),
    configDoValora(acesso.tenantId),
  ]);

  // Uma proposta por cliente: a mais recente que ele fechou.
  const vistas = new Set<string>();
  const propostas: PropostaGanha[] = [];
  for (const p of ganhas) {
    const honorario = Number(p.precoOferecido ?? p.precoAlvo ?? 0);
    if (!p.companyId || vistas.has(p.companyId) || honorario <= 0) continue;
    vistas.add(p.companyId);
    propostas.push({ companyId: p.companyId, cliente: p.cliente, honorario, alvo: p.precoAlvo === null ? null : Number(p.precoAlvo) });
  }
  const linhas = diagnosticarCarteira(propostas, horas, custos.custoDe, cfg.parametros, periodo.meses);
  const semHoras = propostas.length - linhas.length;
  const abaixoDoPiso = linhas.filter((l) => l.margemPct !== null && l.margemPct < cfg.parametros.margemPisoPct).length;

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title="Diagnóstico da carteira"
        subtitle={`O que cada cliente paga contra o que custou de verdade, pelas horas apontadas nos ${periodo.rotulo.toLowerCase()}.`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Clientes com proposta fechada" value={propostas.length} />
        <MetricCard label="Com horas apontadas" value={linhas.length} />
        <MetricCard label="Abaixo da margem mínima" value={abaixoDoPiso} highlight={abaixoDoPiso > 0} sub={`piso de ${cfg.parametros.margemPisoPct}%`} />
        <MetricCard label="Sem horas no período" value={semHoras} />
      </div>

      {!custos.configurado && (
        <p className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] text-fg-secondary">
          O custo das equipes ainda não foi preenchido, então o custo real sai zerado.{" "}
          <Link href="/valora/parametros" className="text-brand hover:underline">
            Preencher nos parâmetros
          </Link>
          .
        </p>
      )}

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            title="Nada para comparar ainda"
            description="O diagnóstico precisa de proposta ganha no Valora ligada a uma empresa, e de horas apontadas nos cards e processos dessa empresa."
          />
        </Card>
      ) : (
        <Card className="p-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-fg-muted">
                <th className="pb-2 pr-3 font-medium">Cliente</th>
                <th className="pb-2 pr-3 font-medium text-right">Honorário</th>
                <th className="pb-2 pr-3 font-medium text-right">Horas/mês</th>
                <th className="pb-2 pr-3 font-medium text-right">Custo real/mês</th>
                <th className="pb-2 pr-3 font-medium text-right">Margem real</th>
                <th className="pb-2 font-medium text-right">Alvo do Valora</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.companyId} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/empresas/${l.companyId}`} className="hover:underline">
                      {l.cliente}
                    </Link>
                    {l.temHoraSemCusto && <span className="block text-[11px] text-fg-muted">tem horas em setor sem custo no Valora</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{MOEDA.format(l.honorario)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{UMA_CASA.format(l.horasMes)} h</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{MOEDA.format(l.custoMes)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {l.margemPct === null ? (
                      "—"
                    ) : l.margemPct < cfg.parametros.margemPisoPct ? (
                      <Badge variant="danger">{UMA_CASA.format(l.margemPct)}%</Badge>
                    ) : l.margemPct < cfg.parametros.margemAlvoPct ? (
                      <Badge variant="warning">{UMA_CASA.format(l.margemPct)}%</Badge>
                    ) : (
                      <Badge variant="success">{UMA_CASA.format(l.margemPct)}%</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-fg-secondary">{l.alvo === null ? "—" : MOEDA.format(l.alvo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-fg-muted">
            Margem real = (honorário − impostos e variáveis de {cfg.parametros.variaveisPct}% − custo real) ÷ honorário. Vermelho: abaixo do piso de{" "}
            {cfg.parametros.margemPisoPct}%; amarelo: abaixo do alvo de {cfg.parametros.margemAlvoPct}%.
          </p>
        </Card>
      )}
    </PageContainer>
  );
}
