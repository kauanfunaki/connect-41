import { Headset, PackageCheck, RotateCcw, Timer } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { GITHUB_MODULE } from "@/lib/github/types";
import { contribuicoesPorPessoa } from "@/lib/github/queries";
import { dayAt } from "@/lib/github/rules";
import { Card } from "@/components/ui/Card";
import { TabelaPorPessoa } from "@/components/produtividade/TabelaPorPessoa";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { Painel } from "@/components/shared/Graficos";
import { CabecalhoDaProdutividade } from "@/components/produtividade/CabecalhoDaProdutividade";
import { PontosPorSemana } from "@/components/produtividade/PontosPorSemana";
import { SaudeDoFluxo } from "@/components/produtividade/SaudeDoFluxo";
import { carregarProdutividade, lerPeriodo } from "@/lib/tech-interno/produtividade";
import { PERIODOS_DAS_ENTREGAS } from "@/lib/tech-interno/entregas";
import { PESO_DO_TAMANHO } from "@/lib/tech-interno/regras";
import { MODULE_ROUTES } from "@/lib/module-catalog";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

/**
 * Produtividade da Tech, aba Painel (05/11/2026, opção A da tela 7 escolhida
 * pelo Kauan; até 06/11 se chamava "Time", e mudou para não confundir com os
 * times dos devs, que estão em Pessoas). O Controle interno e as Entregas dizem o que vamos fazer e o
 * que já fizemos; aqui se mede o time: quatro números, os pontos por semana e
 * a saúde do fluxo para quem coordena. Base: o estudo 14 (04/11) — mede-se
 * entrega validada pesada pelo tamanho, não commit, PR ou token.
 */
export default async function ProdutividadePainelPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { ctx } = await abrirTelaDoModulo(GITHUB_MODULE);
  const periodo = lerPeriodo((await searchParams).periodo);
  const [{ inicio, fim, resumo, semanal, saude, pessoas }, veEntregas] = await Promise.all([carregarProdutividade(ctx.tenantId!, periodo), podeNoModulo(ctx, "tech_entregas", "ver")]);
  // O GitHub de cada pessoa, só como contexto na tabela "Por pessoa"; fora do ar, a coluna mostra "—".
  const github = await contribuicoesPorPessoa(ctx.tenantId!, dayAt(inicio), dayAt(fim)).catch(() => null);
  const intervalo = `${formatInstantDate(inicio)} a ${formatInstantDate(fim)}`;

  return (
    <PageContainer>
      <CabecalhoDaProdutividade
        aba="painel"
        periodo={periodo === "trimestre" ? undefined : periodo}
        subtitulo={`Entregas validadas de ${intervalo}, pesadas pelo tamanho combinado antes de começar: P = ${PESO_DO_TAMANHO.P}, M = ${PESO_DO_TAMANHO.M}, G = ${PESO_DO_TAMANHO.G}.`}
        acao={
          veEntregas ? (
            <Button href={MODULE_ROUTES.tech_entregas} variant="secondary">
              <PackageCheck size={14} aria-hidden />
              O que foi entregue
            </Button>
          ) : undefined
        }
      />
      <div className="mb-5">
        <SegmentedControl
          label="Período"
          active={periodo}
          items={PERIODOS_DAS_ENTREGAS.map((p) => ({ key: p.chave, label: p.rotulo, href: p.chave === "trimestre" ? "?" : `?periodo=${p.chave}` }))}
        />
      </div>

      <FaixaDeTotais
        className="mb-6"
        itens={[
          {
            rotulo: "Pontos entregues",
            valor: formatarNumero(resumo.pontos, 0),
            detalhe: `${resumo.validadas} de ${resumo.entregas} entregas validadas`,
            icone: <PackageCheck />,
          },
          {
            rotulo: "Ciclo mediano",
            valor: resumo.cicloMedianoDias === null ? "—" : `${formatarNumero(resumo.cicloMedianoDias, 1)} dias`,
            detalhe: "do início à conclusão",
            icone: <Timer />,
          },
          {
            rotulo: "Retrabalho",
            valor: formatarNumero(resumo.retrabalho, 0),
            detalhe: resumo.entregas ? `itens que vieram de ${pct(resumo.retrabalho, resumo.entregas)} das entregas` : "itens que vieram de uma entrega",
            tom: resumo.retrabalho > 0 ? "text-warning-fg" : undefined,
            icone: <RotateCcw />,
          },
          {
            rotulo: "Chamados no prazo",
            valor: pct(resumo.chamadosNoPrazo, resumo.chamados),
            detalhe: resumo.chamados ? `${resumo.chamadosNoPrazo} de ${resumo.chamados} resolvidos` : "nenhum chamado resolvido",
            tom: resumo.chamados && resumo.chamadosNoPrazo < resumo.chamados ? "text-warning-fg" : undefined,
            icone: <Headset />,
          },
        ]}
      />

      <div className="mb-6">
        <Painel
          setor="Time"
          cor="var(--c41-setor)"
          titulo="Pontos entregues por semana"
          rodape="Só a entrega validada e com tamanho soma pontos. Nenhuma medida serve sozinha para remuneração: revisar a cada trimestre."
        >
          <PontosPorSemana titulo={`Pontos entregues por semana e por pessoa, de ${intervalo}`} semanas={semanal.semanas} pessoas={semanal.pessoas} />
        </Painel>
      </div>

      {/* Por pessoa (06/11/2026): era a aba Pessoas, que passou a ser a dos
          desenvolvedores e dos times. O mesmo período e os mesmos dados do gráfico. */}
      <Card as="section" aria-labelledby="por-pessoa" className="mb-6 p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="por-pessoa" className="text-section font-semibold text-fg">
            Por pessoa
          </h2>
          <p className="text-fs-2 text-fg-muted">
            O que cada pessoa entregou de {intervalo}, em quanto tempo e quanto voltou. O GitHub mostra atividade, não entrega: fica fora de toda conta.
          </p>
        </div>
        <TabelaPorPessoa pessoas={pessoas} github={github} titulo={`Entregas por pessoa, de ${intervalo}`} />
      </Card>

      <SaudeDoFluxo saude={saude} />
    </PageContainer>
  );
}
