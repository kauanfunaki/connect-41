import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/ui/MetricCard";
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
      <PageHeader
        title="Relatórios do Societário"
        subtitle="Processos abertos agora, mais os concluídos no período. Prazo em dias úteis, descontados os feriados do escritório."
      />

      <div className="flex flex-wrap gap-1.5 mb-5">
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            href={`/societario/relatorios?periodo=${p.chave}`}
            aria-current={p.chave === periodo.chave ? "page" : undefined}
            className={
              p.chave === periodo.chave
                ? "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                : "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
            }
          >
            {p.rotulo}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Abertos agora" value={abertos.length} />
        <MetricCard label="Abertos com prazo estourado" value={estouradosAbertos} highlight={estouradosAbertos > 0} />
        <MetricCard label={`Concluídos em ${periodo.rotulo}`} value={processos.length - abertos.length} />
        <MetricCard
          label="Processos com volta"
          value={voltas.percentualComVolta === null ? "—" : `${voltas.percentualComVolta}%`}
          sub={`${voltas.totalDeVoltas} ${voltas.totalDeVoltas === 1 ? "volta" : "voltas"}`}
        />
      </div>

      <div className="flex flex-col gap-5">
        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">SLA por tipo</h2>
          <p className="text-[12px] text-fg-muted mb-3">
            Dias úteis consumidos contra o previsto do tipo. As voltas ficam na mesma linha porque são a causa do
            estouro.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
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

        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">Processos que mais voltaram</h2>
          <p className="text-[12px] text-fg-muted mb-3">
            {voltas.comVolta} de {voltas.processos} processos tiveram ao menos uma reapresentação.
          </p>
          {maisVoltas.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma volta de exigência no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
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

        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">Produtividade por responsável</h2>
          <p className="text-[12px] text-fg-muted mb-3">
            Concluídos em {periodo.rotulo}, ao lado da carteira aberta. O crédito é do responsável atual do processo —
            não há histórico de redistribuição.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
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

        <Card as="section" className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-[15px] font-semibold">Custo em taxas por processo</h2>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
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
              {custos.length > LINHAS_DE_CUSTO && (
                <p className="mt-2 text-[12px] text-fg-muted">
                  Mostrando os {LINHAS_DE_CUSTO} mais caros de {custos.length}; o total acima soma todos.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
