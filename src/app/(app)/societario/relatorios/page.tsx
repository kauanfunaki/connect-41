import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/ui/MetricCard";
import { FolderOpen, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Card } from "@/components/ui/Card";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { processosParaRelatorio } from "@/lib/societario/painel-data";
import {
  PERIODOS,
  lerPeriodo,
  inicioDoPeriodo,
  slaPorTipo,
  resumoDeVoltas,
  processosComMaisVoltas,
  produtividadePorResponsavel,
  custoPorProcesso,
  totaisDeCusto,
} from "@/lib/societario/relatorios";

const MODULE = "societario_relatorios";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (c: number) => MOEDA.format(c / 100);
const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const numero = (n: number | null) => (n === null ? "—" : DECIMAL.format(n));

const faixaPrevista = (min: number | null, max: number | null) =>
  max === null ? "sem previsão" : min !== null && min !== max ? `${min}–${max}` : String(max);

const TH = "py-2 pr-3 font-medium";
const TD = "py-2 pr-3 tabular-nums";
// Cartão de seção como o do detalhe do processo: título de 14px com a
// explicação logo embaixo, e o conteúdo a um `gap` — eram `mb-1`/`mb-3` soltos.
const SECAO = "p-4 flex flex-col gap-3";
const TITULO = "text-[14px] font-semibold text-fg";
const EXPLICACAO = "text-[12px] text-fg-muted";

/** Quantas linhas de custo a tela mostra — o total soma todas. */
const LINHAS_DE_CUSTO = 30;

export default async function RelatoriosDoSocietarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const periodo = lerPeriodo(params.periodo);
  const agora = new Date();
  const inicio = inicioDoPeriodo(periodo, agora);

  const feriados = await feriadosDoTenant(ctx.tenantId);
  const processos = await processosParaRelatorio(ctx.tenantId, inicio, agora, feriados);

  const sla = slaPorTipo(processos);
  const voltas = resumoDeVoltas(processos);
  const maisVoltas = processosComMaisVoltas(processos);
  const produtividade = produtividadePorResponsavel(processos, inicio, agora);
  const custos = custoPorProcesso(processos);
  const totais = totaisDeCusto(custos);

  const abertos = processos.filter((p) => p.concluidoEm === null);
  const estouradosAbertos = abertos.filter((p) => p.prazo.situacao === "estourado").length;

  return (
    <PageContainer>
      {/* O período escrito (07/10, auditoria dos gráficos): no padrão (90
          dias) o Filtros não mostra chip, e ele só aparecia no rótulo de um
          dos cartões. */}
      <PageHeader
        title="Relatórios do Societário"
        subtitle={`Processos abertos agora, mais os concluídos nos últimos ${periodo.rotulo}. Prazo em dias úteis, descontados os feriados do escritório.`}
      />

      {/* O período no botão "Filtros" — eram pílulas (conferência de 30/09). */}
      <FiltrosDaTela
        className="mb-5"
        campos={[
          {
            chave: "periodo",
            rotulo: "Período",
            vazioLabel: `Últimos ${PERIODOS[1].rotulo}`,
            opcoes: PERIODOS.filter((p) => p !== PERIODOS[1]).map((p) => ({ value: p.chave, label: `Últimos ${p.rotulo}` })),
          },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Abertos agora" value={abertos.length} icon={<FolderOpen size={16} />} />
        <MetricCard label="Abertos com prazo estourado" value={estouradosAbertos} highlight={estouradosAbertos > 0} icon={<AlertTriangle size={16} />} />
        <MetricCard label={`Concluídos em ${periodo.rotulo}`} value={processos.length - abertos.length} icon={<CheckCircle2 size={16} />} />
        <MetricCard
          label="Processos com volta"
          icon={<RotateCcw size={16} />}
          value={voltas.percentualComVolta === null ? "—" : `${voltas.percentualComVolta}%`}
          sub={`${voltas.totalDeVoltas} ${voltas.totalDeVoltas === 1 ? "volta" : "voltas"}`}
        />
      </div>

      <div className="flex flex-col gap-5">
        <Card as="section" className={SECAO}>
          <div className="flex flex-col gap-0.5">
            <h2 className={TITULO}>SLA por tipo</h2>
            <p className={EXPLICACAO}>
              Dias úteis consumidos contra o previsto do tipo. As voltas ficam na mesma linha porque são a causa do
              estouro.
            </p>
          </div>
          <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Previsto</th>
                  <th className={TH}>Processos</th>
                  <th className={TH}>Dentro</th>
                  <th className={TH}>No limite</th>
                  <th className={TH}>Estourados</th>
                  <th className={TH}>Média de dias</th>
                  <th className={TH}>Média de voltas</th>
                </tr>
              </thead>
              <tbody>
                {sla.map((l) => (
                  <tr key={l.tipoId} className="border-b border-border-soft">
                    <td className="py-2 pr-3 font-medium">{l.tipoNome}</td>
                    <td className={TD}>{faixaPrevista(l.previstoMin, l.previstoMax)}</td>
                    <td className={TD}>
                      {l.total}
                      <span className="text-fg-muted"> ({l.concluidos} concl.)</span>
                    </td>
                    {/* Tipo sem previsão (alvará) não tem dentro nem fora: traço em vez de zero. */}
                    <td className={TD}>{l.previstoMax === null ? "—" : l.dentro}</td>
                    <td className={TD}>{l.previstoMax === null ? "—" : l.noLimite}</td>
                    <td className={`${TD} ${l.estourados > 0 ? "text-danger font-medium" : ""}`}>
                      {l.previstoMax === null ? "—" : l.estourados}
                    </td>
                    <td className={TD}>{numero(l.mediaDeDias)}</td>
                    <td className={TD}>{numero(l.mediaDeVoltas)}</td>
                  </tr>
                ))}
                {sla.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-fg-muted">
                      Nenhum processo no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card as="section" className={SECAO}>
          <div className="flex flex-col gap-0.5">
            <h2 className={TITULO}>Processos que mais voltaram</h2>
            <p className={EXPLICACAO}>
              {voltas.comVolta} de {voltas.processos} processos tiveram ao menos uma reapresentação.
            </p>
          </div>
          {maisVoltas.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma volta de exigência no período.</p>
          ) : (
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}>Processo</th>
                    <th className={TH}>Voltas</th>
                    <th className={TH}>Dias úteis</th>
                    <th className={TH}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {maisVoltas.map((p) => (
                    <tr key={p.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3">
                        <Link href={`/processos/${p.id}`} className="text-brand hover:underline">
                          {p.tipoNome} — {p.empresaNome}
                        </Link>
                      </td>
                      <td className={`${TD} text-danger font-medium`}>{p.voltas}</td>
                      <td className={TD}>{p.prazo.dias}</td>
                      <td className="py-2 pr-3 text-fg-secondary">{p.concluidoEm ? "Concluído" : "Aberto"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card as="section" className={SECAO}>
          <div className="flex flex-col gap-0.5">
            <h2 className={TITULO}>Produtividade por responsável</h2>
            <p className={EXPLICACAO}>
              Concluídos em {periodo.rotulo}, ao lado da carteira aberta. O crédito é do responsável atual do processo —
              não há histórico de redistribuição.
            </p>
          </div>
          <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className={TH}>Responsável</th>
                  <th className={TH}>Concluídos</th>
                  <th className={TH}>Média de dias</th>
                  <th className={TH}>Voltas nos concluídos</th>
                  <th className={TH}>Abertos</th>
                  <th className={TH}>Abertos estourados</th>
                </tr>
              </thead>
              <tbody>
                {produtividade.map((l) => (
                  <tr key={l.responsavelId ?? "nenhum"} className="border-b border-border-soft">
                    <td className="py-2 pr-3 font-medium">{l.nome}</td>
                    <td className={TD}>{l.concluidosNoPeriodo}</td>
                    <td className={TD}>{numero(l.mediaDeDiasDosConcluidos)}</td>
                    <td className={TD}>{l.voltasDosConcluidos}</td>
                    <td className={TD}>{l.abertos}</td>
                    <td className={`${TD} ${l.estouradosAbertos > 0 ? "text-danger font-medium" : ""}`}>
                      {l.estouradosAbertos}
                    </td>
                  </tr>
                ))}
                {produtividade.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-fg-muted">
                      Nenhum processo no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card as="section" className={SECAO}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={TITULO}>Custo em taxas por processo</h2>
            <p className="text-[13px] tabular-nums">
              <strong>{moeda(totais.totalCentavos)}</strong>
              {totais.custoDasVoltasCentavos > 0 && (
                <span className="text-warning"> · {moeda(totais.custoDasVoltasCentavos)} de reapresentação</span>
              )}
            </p>
          </div>
          {custos.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma taxa registrada nos processos do período.</p>
          ) : (
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[680px] text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}>Processo</th>
                    <th className={TH}>Voltas</th>
                    <th className={TH}>Total</th>
                    <th className={TH}>Pago</th>
                    <th className={TH}>Das voltas</th>
                  </tr>
                </thead>
                <tbody>
                  {custos.slice(0, LINHAS_DE_CUSTO).map((l) => (
                    <tr key={l.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3">
                        <Link href={`/processos/${l.id}`} className="text-brand hover:underline">
                          {l.tipoNome} — {l.empresaNome}
                        </Link>
                      </td>
                      <td className={TD}>{l.voltas}</td>
                      <td className={TD}>{moeda(l.totalCentavos)}</td>
                      <td className={TD}>{moeda(l.pagoCentavos)}</td>
                      <td className={`${TD} ${l.custoDasVoltasCentavos > 0 ? "text-warning" : ""}`}>
                        {moeda(l.custoDasVoltasCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Fora da caixa da tabela: dentro, a nota ficava colada na borda,
              sem o recuo das células. */}
          {custos.length > LINHAS_DE_CUSTO && (
            <p className={EXPLICACAO}>
              Mostrando os {LINHAS_DE_CUSTO} mais caros de {custos.length}; o total acima soma todos.
            </p>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
