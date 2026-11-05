import { PackageCheck, Gauge, Timer, RotateCcw } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { entregasDoPeriodo, PERIODOS_DAS_ENTREGAS, type PeriodoDasEntregas } from "@/lib/tech-interno/entregas";
import { PESO_DO_TAMANHO, ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

/**
 * Entregas da Tech (04/11/2026, lote D dos ajustes de 03/11). A produtividade
 * pelo que foi entregue e validado, e não por PR, commit ou token: a entrega
 * vale o tamanho combinado antes de começar (P = 1, M = 3, G = 8), e ao lado
 * ficam o tempo de ciclo, o retrabalho e os chamados.
 */
export default async function EntregasDaTechPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { ctx } = await abrirTelaDoModulo("tech_entregas");
  const { periodo: bruto } = await searchParams;
  const periodo: PeriodoDasEntregas = PERIODOS_DAS_ENTREGAS.some((p) => p.chave === bruto) ? (bruto as PeriodoDasEntregas) : "trimestre";
  const { inicio, fim, pessoas } = await entregasDoPeriodo(ctx.tenantId!, periodo);

  const t = pessoas.reduce(
    (a, p) => ({ entregas: a.entregas + p.entregas, validadas: a.validadas + p.validadas, pontos: a.pontos + p.pontos, semTamanho: a.semTamanho + p.semTamanho, retrabalho: a.retrabalho + p.retrabalho, voltas: a.voltas + p.voltasDaValidacao }),
    { entregas: 0, validadas: 0, pontos: 0, semTamanho: 0, retrabalho: 0, voltas: 0 }
  );

  return (
    <PageContainer>
      <PageHeader
        title="Entregas da Tech"
        subtitle={`O que foi entregue e validado de ${formatInstantDate(inicio)} a ${formatInstantDate(fim)}. Cada entrega vale o tamanho combinado antes de começar: P = ${PESO_DO_TAMANHO.P}, M = ${PESO_DO_TAMANHO.M}, G = ${PESO_DO_TAMANHO.G}.`}
        action={
          <Button href={ROTA_TECH_INTERNO} variant="secondary">
            Controle interno
          </Button>
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
          { rotulo: "Pontos entregues", valor: formatarNumero(t.pontos, 0), detalhe: `${t.validadas} entregas validadas`, icone: <PackageCheck /> },
          { rotulo: "Passaram pela validação", valor: pct(t.validadas, t.entregas), detalhe: `${t.entregas} concluídas`, icone: <Gauge /> },
          {
            rotulo: "Voltaram da validação",
            valor: formatarNumero(t.voltas, 0),
            tom: t.voltas > 0 ? "text-warning-fg" : undefined,
            icone: <RotateCcw />,
          },
          {
            rotulo: "Retrabalho",
            valor: formatarNumero(t.retrabalho, 0),
            detalhe: "itens que vieram de uma entrega",
            tom: t.retrabalho > 0 ? "text-warning-fg" : undefined,
            icone: <Timer />,
          },
        ]}
      />

      <Card as="section" aria-labelledby="por-pessoa" className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="por-pessoa" className="text-section font-semibold text-fg">
            Por pessoa
          </h2>
          <p className="text-fs-2 text-fg-muted">
            Só a entrega que passou por “Em validação” soma pontos. Picar um item em dez não soma tamanho: quem coordena define, e ele trava quando o item
            começa.
          </p>
        </div>
        {pessoas.length === 0 ? (
          <EmptyState icon={<PackageCheck />} title="Nenhuma entrega no período" description="Itens concluídos e chamados resolvidos aparecem aqui." />
        ) : (
          <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  {["Pessoa", "Pontos", "Validadas", "Ciclo (mediana)", "Voltas da validação", "Retrabalho", "Chamados no prazo"].map((c) => (
                    <th key={c} className="px-3 py-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.userId ?? "sem"} className="border-b border-border-soft tabular-nums">
                    <td className="px-3 py-2 font-medium">{p.nome}</td>
                    <td className="px-3 py-2 font-semibold">{p.pontos}</td>
                    <td className="px-3 py-2">
                      {p.validadas} de {p.entregas}
                      {p.semTamanho > 0 && <span className="block text-micro text-warning-fg">{p.semTamanho} sem tamanho</span>}
                    </td>
                    <td className="px-3 py-2">{p.cicloMedianoDias === null ? "—" : `${formatarNumero(p.cicloMedianoDias, 1)} dias`}</td>
                    <td className={`px-3 py-2 ${p.voltasDaValidacao > 0 ? "text-warning-fg" : ""}`}>{p.voltasDaValidacao}</td>
                    <td className={`px-3 py-2 ${p.retrabalho > 0 ? "text-warning-fg" : ""}`}>{p.retrabalho}</td>
                    <td className="px-3 py-2">
                      {p.chamados === 0 ? "—" : `${p.chamadosNoPrazo} de ${p.chamados}`}
                      {p.chamadosReabertos > 0 && <span className="block text-micro text-warning-fg">{p.chamadosReabertos} reabertos</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-micro text-fg-muted">
          Toda medida vira meta e é contornada: revisar a cada trimestre e não usar nenhuma sozinha para remuneração. O GitHub segue como contexto da atividade, no módulo dele.
          {t.semTamanho > 0 && " Entregas sem tamanho não somam pontos — defina o tamanho antes de o item começar."}
        </p>
      </Card>
    </PageContainer>
  );
}
