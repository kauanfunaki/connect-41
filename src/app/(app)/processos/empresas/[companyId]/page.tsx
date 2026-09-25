import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDate } from "@/lib/format";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { visaoDoCliente, type ProcessoDoCliente } from "@/lib/societario/painel-data";
import { listarLicencas } from "@/lib/societario/licencas-data";
import {
  situacaoDaLicenca,
  SITUACAO_LABEL as SITUACAO_DA_LICENCA_LABEL,
  SITUACAO_VARIANTE as SITUACAO_DA_LICENCA_VARIANTE,
} from "@/lib/societario/licencas";
import { textoDoPrazo } from "@/lib/societario/prazos";
import { PRIORIDADE_LABEL, PRIORIDADE_VARIANTE } from "@/lib/societario/prioridade";
import { PrazoCelula, SITUACAO_LABEL, SITUACAO_VARIANTE } from "@/components/societario/ProcessosFila";

const MODULE = "societario_processos";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (c: number) => MOEDA.format(c / 100);

const TH = "py-2 pr-3 font-medium";

function LinhaDeProcesso({ p }: { p: ProcessoDoCliente }) {
  return (
    <Link
      href={`/processos/${p.id}`}
      className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-1 py-3 border-b border-border-soft hover:bg-surface-hover transition-colors"
    >
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold">{p.tipoNome}</span>
        {p.titulo && <span className="text-[12px] text-fg-secondary truncate">{p.titulo}</span>}
        {p.prioridade !== "NORMAL" && (
          <Badge variant={PRIORIDADE_VARIANTE[p.prioridade]}>{PRIORIDADE_LABEL[p.prioridade]}</Badge>
        )}
        {p.voltas > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-danger">
            <AlertCircle size={12} />
            {p.voltas} {p.voltas === 1 ? "volta" : "voltas"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 md:justify-end flex-wrap text-[12px] text-fg-muted">
        <PrazoCelula prazo={p.prazo} />
        {p.cancelado ? (
          <Badge variant="danger">{p.encerradoComo === "INDEFERIDO" ? "Indeferido" : "Cancelado"}</Badge>
        ) : (
          <Badge variant={SITUACAO_VARIANTE[p.situacao]}>
            {SITUACAO_LABEL[p.situacao]}
          </Badge>
        )}
        <span className="whitespace-nowrap">{p.responsavelNome ?? "sem responsável"}</span>
        <span className="whitespace-nowrap tabular-nums">
          {formatInstantDate(p.iniciadoEm)}
          {p.concluidoEm && ` → ${formatInstantDate(p.concluidoEm)}`}
        </span>
      </div>
    </Link>
  );
}

export default async function VisaoSocietariaDoClientePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const { companyId } = await params;
  const agora = new Date();
  const feriados = await feriadosDoTenant(ctx.tenantId);
  // `visaoDoCliente` busca a empresa com o tenant no `where`: id de outro
  // escritório volta nulo e vira 404, antes de qualquer licença ser lida.
  const visao = await visaoDoCliente(ctx.tenantId, companyId, agora, feriados);
  if (!visao) notFound();
  const licencas = await listarLicencas(ctx.tenantId, agora, companyId);

  const situacoes = licencas.map((l) => situacaoDaLicenca(l, agora));
  const vencendo = situacoes.filter((s) => s === "vencida" || s === "a_renovar").length;
  const exigenciasAbertas = visao.exigencias.filter((e) => e.resolvedAt === null).length;
  const aPagar = visao.custo.totalCentavos - visao.custo.pagoCentavos;

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title={visao.empresa.nome}
        subtitle={
          visao.empresa.nome !== visao.empresa.razaoSocial ? `${visao.empresa.razaoSocial} · visão do Societário` : "Visão do Societário"
        }
        action={
          <Link href={`/empresas/${visao.empresa.id}`} className="text-[13px] text-brand hover:underline">
            Cadastro da empresa
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Processos abertos" value={visao.abertos.length} />
        <MetricCard label="Exigências abertas" value={exigenciasAbertas} highlight={exigenciasAbertas > 0} />
        <MetricCard label="Licenças vencendo" value={vencendo} highlight={vencendo > 0} />
        <MetricCard label="Taxas a pagar" value={moeda(aPagar)} sub={`de ${moeda(visao.custo.totalCentavos)}`} highlight={aPagar > 0} />
      </div>

      <div className="flex flex-col gap-5">
        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">Processos abertos</h2>
          {visao.abertos.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhum processo aberto para esta empresa.</p>
          ) : (
            visao.abertos.map((p) => <LinhaDeProcesso key={p.id} p={p} />)
          )}
        </Card>

        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">Licenças</h2>
          {licencas.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma licença cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}>Licença</th>
                    <th className={TH}>Órgão</th>
                    <th className={TH}>Validade</th>
                    <th className={TH}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {licencas.map((l, i) => (
                    <tr key={l.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3">
                        {l.kind}
                        {l.number && <span className="text-fg-muted"> nº {l.number}</span>}
                      </td>
                      <td className="py-2 pr-3 text-fg-secondary">{l.orgaoNome ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {l.expiresAt ? formatInstantDate(l.expiresAt) : "sem validade"}
                        {l.expiresAt && !l.revokedAt && (situacoes[i] === "vencida" || situacoes[i] === "a_renovar") && (
                          <span className="block text-[11px] text-fg-muted">{textoDoPrazo(l.expiresAt, agora)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={SITUACAO_DA_LICENCA_VARIANTE[situacoes[i]]}>
                          {SITUACAO_DA_LICENCA_LABEL[situacoes[i]]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">Exigências</h2>
          {visao.exigencias.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma exigência nos processos desta empresa.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}>Exigência</th>
                    <th className={TH}>Processo</th>
                    <th className={TH}>Prazo do órgão</th>
                    <th className={TH}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visao.exigencias.map((e) => (
                    <tr key={e.id} className="border-b border-border-soft align-top">
                      <td className={`py-2 pr-3 max-w-[340px] ${e.resolvedAt ? "text-fg-muted" : ""}`}>{e.descricao}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/processos/${e.processoId}`} className="text-brand hover:underline">
                          {e.tipoNome}
                        </Link>
                        <span className="block text-[11px] text-fg-muted">
                          {e.orgaoNome} · {e.tentativa}ª tentativa
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {e.dueAt ? formatInstantDate(e.dueAt) : <span className="text-fg-muted">sem prazo</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {e.resolvedAt ? (
                          <Badge variant="success">Cumprida</Badge>
                        ) : (
                          <Badge variant="warning">Aberta</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card as="section" className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h2 className="text-[15px] font-semibold">Taxas</h2>
            {visao.taxas.length > 0 && (
              <p className="text-[13px] tabular-nums">
                <strong>{moeda(visao.custo.totalCentavos)}</strong>
                <span className="text-fg-muted"> · {moeda(visao.custo.pagoCentavos)} pagos</span>
                {aPagar > 0 && <span className="text-warning"> · {moeda(aPagar)} a pagar</span>}
              </p>
            )}
          </div>
          {visao.custo.custoDasVoltasCentavos > 0 && (
            <p className="text-[12px] text-warning mb-2">
              {moeda(visao.custo.custoDasVoltasCentavos)} vieram de reapresentação.
            </p>
          )}
          {visao.taxas.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma taxa registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}>Taxa</th>
                    <th className={TH}>Processo</th>
                    <th className={TH}>Valor</th>
                    <th className={TH}>Vencimento</th>
                    <th className={TH}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visao.taxas.map((t) => (
                    <tr key={t.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3">
                        {t.descricao}
                        {t.attempt !== null && t.attempt >= 2 && (
                          <span className="block text-[11px] text-warning">{t.attempt}ª tentativa</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {t.processoId ? (
                          <Link href={`/processos/${t.processoId}`} className="text-brand hover:underline">
                            {t.tipoNome}
                          </Link>
                        ) : (
                          <span className="text-fg-muted">avulsa</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{moeda(t.amountCents)}</td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {t.dueDate ? formatInstantDate(t.dueDate) : "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {t.paidAt ? (
                          <Badge variant="success">Paga</Badge>
                        ) : (
                          <Badge variant="warning">Em aberto</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card as="section" className="p-4">
          <h2 className="text-[15px] font-semibold mb-1">Processos encerrados</h2>
          {visao.encerrados.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhum processo concluído ou cancelado.</p>
          ) : (
            visao.encerrados.map((p) => <LinhaDeProcesso key={p.id} p={p} />)
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
