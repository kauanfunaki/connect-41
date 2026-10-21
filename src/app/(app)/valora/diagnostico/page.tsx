import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CircleDashed, Clock, Handshake, TrendingDown } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { acessoAoValora, configDoValora } from "@/lib/valora/servidor";
import { custosDoTenant, horasDoPeriodo, periodoDaUrl } from "@/lib/gestao/horas";
import { diagnosticarCarteira, type PropostaGanha } from "@/lib/gestao/custo";
import { formatarNumero, formatarReais } from "@/lib/format";

export const dynamic = "force-dynamic";


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

  // A margem contra o piso e o alvo é a situação do cliente: o `Selo`, e não o
  // `Badge` de categoria (2A, 08/10/2026). Na tabela e no cartão do celular.
  const seloDaMargem = (margemPct: number | null) =>
    margemPct === null ? (
      "—"
    ) : margemPct < cfg.parametros.margemPisoPct ? (
      <Selo tom="perigo">{formatarNumero(margemPct, 1)}%</Selo>
    ) : margemPct < cfg.parametros.margemAlvoPct ? (
      <Selo tom="atencao">{formatarNumero(margemPct, 1)}%</Selo>
    ) : (
      <Selo tom="sucesso">{formatarNumero(margemPct, 1)}%</Selo>
    );

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): a tela sai do Valora. */}
      <Breadcrumb items={[{ label: "Valora", href: "/valora" }, { label: "Diagnóstico da carteira" }]} />
      <PageHeader
        title="Diagnóstico da carteira"
        subtitle={`O que cada cliente paga contra o que custou de verdade, pelas horas apontadas nos ${periodo.rotulo.toLowerCase()}.`}
      />

      {/* Os números do topo no cartão padrão, com ícone (30/09). */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Clientes com proposta fechada", valor: formatarNumero(propostas.length, 0), icone: <Handshake /> },
          { rotulo: "Com horas apontadas", valor: formatarNumero(linhas.length, 0), icone: <Clock /> },
          {
            rotulo: "Abaixo da margem mínima",
            valor: formatarNumero(abaixoDoPiso, 0),
            icone: <TrendingDown />,
            // Crítico, como o selo da margem abaixo do piso na tabela (07/10):
            // o cartão era âmbar e o selo, vermelho, para a mesma situação.
            tom: abaixoDoPiso > 0 ? "text-danger" : undefined,
            detalhe: `piso de ${cfg.parametros.margemPisoPct}%`,
          },
          { rotulo: "Sem horas no período", valor: formatarNumero(semHoras, 0), icone: <CircleDashed />, tom: "text-fg-muted" },
        ]}
      />

      {!custos.configurado && (
        // Revisão de 05/10: botão não é link — o destino era texto azul no fim da frase.
        // No `Aviso` de atenção (15/10/2026), como o da chave de IA: era uma caixa
        // cinza montada à mão.
        <Aviso tom="atencao" className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="text-fg">O custo das equipes ainda não foi preenchido nos parâmetros, então o custo real sai zerado.</p>
          <Button href="/valora/parametros" variant="secondary" size="xs">
            Preencher parâmetros
          </Button>
        </Aviso>
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
          {/* No celular, cartões (15/10/2026): a tabela rolava de lado, com a
              margem fora da tela. */}
          <CartoesNoCelular>
            {linhas.map((l) => (
              <Cartao key={l.companyId}>
                <TopoDoCartao
                  nome={
                    <Link href={`/empresas/${l.companyId}`} className="text-fg hover:text-brand transition-colors">
                      {l.cliente}
                    </Link>
                  }
                  valor={formatarReais(l.honorario)}
                />
                <InfoDoCartao className="tabular-nums">
                  {formatarNumero(l.horasMes, 1)} h/mês · custo real {formatarReais(l.custoMes)}/mês
                </InfoDoCartao>
                <InfoDoCartao className="tabular-nums">Alvo do Valora: {l.alvo === null ? "—" : formatarReais(l.alvo)}</InfoDoCartao>
                {l.temHoraSemCusto && <InfoDoCartao>tem horas em setor sem custo no Valora</InfoDoCartao>}
                <PeDoCartao>
                  <span className="text-ui text-fg-muted">Margem real</span>
                  {seloDaMargem(l.margemPct)}
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>
          {/* Casco padrão, centralizado (30/09). Sem funil: um cliente por
              linha, e o resto é valor — nada que se repita para filtrar. */}
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
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
                      {l.temHoraSemCusto && <span className="block text-fs-1 text-fg-muted">tem horas em setor sem custo no Valora</span>}
                    </td>
                    <td className="px-3 tabular-nums">{formatarReais(l.honorario)}</td>
                    <td className="px-3 tabular-nums">{formatarNumero(l.horasMes, 1)} h</td>
                    <td className="px-3 tabular-nums">{formatarReais(l.custoMes)}</td>
                    <td className="px-3 tabular-nums">
                      {seloDaMargem(l.margemPct)}
                    </td>
                    <td className="px-3 tabular-nums text-fg-secondary">{l.alvo === null ? "—" : formatarReais(l.alvo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
          <NotaDeFonte>
            Margem real = (honorário − impostos e variáveis de {cfg.parametros.variaveisPct}% − custo real) ÷ honorário. Vermelho: abaixo do piso de{" "}
            {cfg.parametros.margemPisoPct}%; amarelo: abaixo do alvo de {cfg.parametros.margemAlvoPct}%.
          </NotaDeFonte>
        </>
      )}
    </PageContainer>
  );
}
