import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { CircleDashed, Clock, Handshake, TrendingDown } from "lucide-react";
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

      {/* Os números do topo no cartão padrão, com ícone (30/09). */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Clientes com proposta fechada", valor: String(propostas.length), icone: <Handshake /> },
          { rotulo: "Com horas apontadas", valor: String(linhas.length), icone: <Clock /> },
          {
            rotulo: "Abaixo da margem mínima",
            valor: String(abaixoDoPiso),
            icone: <TrendingDown />,
            // Crítico, como o selo da margem abaixo do piso na tabela (07/10):
            // o cartão era âmbar e o selo, vermelho, para a mesma situação.
            tom: abaixoDoPiso > 0 ? "text-danger" : undefined,
            detalhe: `piso de ${cfg.parametros.margemPisoPct}%`,
          },
          { rotulo: "Sem horas no período", valor: String(semHoras), icone: <CircleDashed />, tom: "text-fg-muted" },
        ]}
      />

      {!custos.configurado && (
        // Revisão de 05/10: botão não é link — o destino era texto azul no fim da frase.
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] text-fg-secondary">
          <p>O custo das equipes ainda não foi preenchido nos parâmetros, então o custo real sai zerado.</p>
          <Button href="/valora/parametros" variant="secondary" size="xs">
            Preencher parâmetros
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            title="Nada para comparar ainda"
            description="O diagnóstico precisa de proposta ganha no Valora ligada a uma empresa, e de horas apontadas nos cards e processos dessa empresa."
          />
        </Card>
      ) : (
        <>
          {/* Casco padrão, centralizado (30/09). Sem funil: um cliente por
              linha, e o resto é valor — nada que se repita para filtrar. */}
          <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full min-w-[820px] text-[length:var(--fs-ui)]">
              <thead>
                <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-3">Cliente</th>
                  <th className="px-3">Honorário</th>
                  <th className="px-3">Horas/mês</th>
                  <th className="px-3">Custo real/mês</th>
                  <th className="px-3">Margem real</th>
                  <th className="px-3">Alvo do Valora</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.companyId} className="border-b border-border align-top">
                    <td className="px-3">
                      <Link href={`/empresas/${l.companyId}`} className="font-medium text-fg hover:text-brand transition-colors">
                        {l.cliente}
                      </Link>
                      {l.temHoraSemCusto && <span className="block text-[11px] text-fg-muted">tem horas em setor sem custo no Valora</span>}
                    </td>
                    <td className="px-3 tabular-nums">{MOEDA.format(l.honorario)}</td>
                    <td className="px-3 tabular-nums">{UMA_CASA.format(l.horasMes)} h</td>
                    <td className="px-3 tabular-nums">{MOEDA.format(l.custoMes)}</td>
                    <td className="px-3 tabular-nums">
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
                    <td className="px-3 tabular-nums text-fg-secondary">{l.alvo === null ? "—" : MOEDA.format(l.alvo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-fg-muted">
            Margem real = (honorário − impostos e variáveis de {cfg.parametros.variaveisPct}% − custo real) ÷ honorário. Vermelho: abaixo do piso de{" "}
            {cfg.parametros.margemPisoPct}%; amarelo: abaixo do alvo de {cfg.parametros.margemAlvoPct}%.
          </p>
        </>
      )}
    </PageContainer>
  );
}
