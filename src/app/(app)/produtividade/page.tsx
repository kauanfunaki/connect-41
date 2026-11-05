import { Headset, PackageCheck, RotateCcw, Timer } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { GITHUB_MODULE } from "@/lib/github/types";
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
 * Produtividade da Tech, aba Time (05/11/2026, opção A da tela 7 escolhida
 * pelo Kauan). O Controle interno e as Entregas dizem o que vamos fazer e o
 * que já fizemos; aqui se mede o time: quatro números, os pontos por semana e
 * a saúde do fluxo para quem coordena. Base: o estudo 14 (04/11) — mede-se
 * entrega validada pesada pelo tamanho, não commit, PR ou token.
 */
export default async function ProdutividadeTimePage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { ctx } = await abrirTelaDoModulo(GITHUB_MODULE);
  const periodo = lerPeriodo((await searchParams).periodo);
  const [{ inicio, fim, resumo, semanal, saude }, veEntregas] = await Promise.all([carregarProdutividade(ctx.tenantId!, periodo), podeNoModulo(ctx, "tech_entregas", "ver")]);
  const intervalo = `${formatInstantDate(inicio)} a ${formatInstantDate(fim)}`;

  return (
    <PageContainer>
      <CabecalhoDaProdutividade
        aba="time"
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

      <SaudeDoFluxo saude={saude} />
    </PageContainer>
  );
}
