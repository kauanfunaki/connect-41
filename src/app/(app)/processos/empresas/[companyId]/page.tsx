import { notFound } from "next/navigation";
import { AlertCircle, AlertTriangle, Building2, CalendarClock, FolderOpen, Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Selo } from "@/components/ui/Selo";
import { Card } from "@/components/ui/Card";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { TOM_DA_VARIANTE } from "@/components/societario/tomDoSelo";
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
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";

const MODULE = "societario_processos";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (c: number) => MOEDA.format(c / 100);
/** Dia em ISO (AAAA-MM-DD) para o funil — no fuso de São Paulo, como o `formatInstantDate` mostra. */
const dia = (d: Date | null) => (d ? saoPauloParts(d).dateKey : "");

const TH = "py-2 pr-3 font-medium";
// Cartão de seção: título de 14px, como no detalhe do processo, e o respiro
// entre título e conteúdo pelo `gap` — era `mb-1`, com a tabela colada no título.
const SECAO = "p-4 flex flex-col gap-3";
const TITULO = "text-[length:var(--fs-card-title)] font-semibold text-fg";
// O link da célula no desenho da fila de processos (07/10/2026): negrito, cor
// do texto e azul só no hover — aqui era azul sublinhado, um dos quatro
// desenhos do módulo.
const LINK = "font-semibold text-fg hover:text-brand transition-colors";

function LinhaDeProcesso({ p }: { p: ProcessoDoCliente }) {
  return (
    <Link
      href={`/processos/${p.id}`}
      className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-1 py-3 border-b border-border-soft hover:bg-surface-hover transition-colors"
    >
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-[length:var(--fs-ui)] font-semibold">{p.tipoNome}</span>
        {p.titulo && <span className="text-[length:var(--fs-2)] text-fg-secondary truncate">{p.titulo}</span>}
        {p.prioridade !== "NORMAL" && (
          <Selo tom={TOM_DA_VARIANTE[PRIORIDADE_VARIANTE[p.prioridade]]}>{PRIORIDADE_LABEL[p.prioridade]}</Selo>
        )}
        {p.voltas > 0 && (
          <span className="inline-flex items-center gap-1 text-[length:var(--fs-micro)] text-danger">
            <AlertCircle size={12} />
            {p.voltas} {p.voltas === 1 ? "volta" : "voltas"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 md:justify-end flex-wrap text-[length:var(--fs-2)] text-fg-muted">
        <PrazoCelula prazo={p.prazo} />
        {/* Selo, e não Badge: é a situação da linha (regra de 02/10 no Selo). */}
        {p.cancelado ? (
          <Selo tom="perigo">{p.encerradoComo === "INDEFERIDO" ? "Indeferido" : "Cancelado"}</Selo>
        ) : (
          <Selo tom={TOM_DA_VARIANTE[SITUACAO_VARIANTE[p.situacao]]}>{SITUACAO_LABEL[p.situacao]}</Selo>
        )}
        <span className="whitespace-nowrap">{p.responsavelNome ?? "Sem responsável"}</span>
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
          <Button href={`/empresas/${visao.empresa.id}`} variant="secondary">
            <Building2 size={14} /> Cadastro da empresa
          </Button>
        }
      />

      {/* Os totais no cartão das filas irmãs (Processos, Licenças) — era o
          MetricCard sem ícone, um dos três desenhos de total do módulo
          (07/10/2026). */}
      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Processos abertos", valor: String(visao.abertos.length), icone: <FolderOpen /> },
          {
            rotulo: "Exigências abertas",
            valor: String(exigenciasAbertas),
            icone: <AlertTriangle />,
            tom: exigenciasAbertas > 0 ? "text-warning" : undefined,
          },
          {
            rotulo: "Licenças vencendo",
            valor: String(vencendo),
            icone: <CalendarClock />,
            tom: vencendo > 0 ? "text-warning" : undefined,
          },
          {
            rotulo: "Taxas a pagar",
            valor: moeda(aPagar),
            icone: <Receipt />,
            tom: aPagar > 0 ? "text-warning" : undefined,
            detalhe: `de ${moeda(visao.custo.totalCentavos)}`,
          },
        ]}
      />

      <div className="flex flex-col gap-5">
        <Card as="section" className={SECAO}>
          <h2 className={TITULO}>Processos abertos</h2>
          {visao.abertos.length === 0 ? (
            <p className="text-[length:var(--fs-ui)] text-fg-muted">Nenhum processo aberto para esta empresa.</p>
          ) : (
            <div>
              {visao.abertos.map((p) => (
                <LinhaDeProcesso key={p.id} p={p} />
              ))}
            </div>
          )}
        </Card>

        <Card as="section" className={SECAO}>
          <h2 className={TITULO}>Licenças</h2>
          {licencas.length === 0 ? (
            <p className="text-[length:var(--fs-ui)] text-fg-muted">Nenhuma licença cadastrada.</p>
          ) : (
            <TabelaFiltravel
              linhas={licencas.map((l, i) => ({
                id: l.id,
                valores: {
                  licenca: l.kind,
                  orgao: l.orgaoNome ?? "",
                  validade: dia(l.expiresAt),
                  situacao: SITUACAO_DA_LICENCA_LABEL[situacoes[i]],
                },
              }))}
            >
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}><FiltroDaColuna rotulo="Licença" chave="licenca" /></th>
                    <th className={TH}><FiltroDaColuna rotulo="Órgão" chave="orgao" /></th>
                    <th className={TH}><FiltroDaColuna rotulo="Validade" chave="validade" tipo="data" align="right" /></th>
                    <th className={TH}><FiltroDaColuna rotulo="Situação" chave="situacao" align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {licencas.map((l, i) => (
                    <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3">
                        {l.kind}
                        {l.number && <span className="text-fg-muted"> nº {l.number}</span>}
                      </td>
                      <td className="py-2 pr-3 text-fg-secondary">{l.orgaoNome ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {l.expiresAt ? formatInstantDate(l.expiresAt) : "sem validade"}
                        {l.expiresAt && !l.revokedAt && (situacoes[i] === "vencida" || situacoes[i] === "a_renovar") && (
                          <span className="block text-[length:var(--fs-micro)] text-fg-muted">{textoDoPrazo(l.expiresAt, agora)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Selo tom={TOM_DA_VARIANTE[SITUACAO_DA_LICENCA_VARIANTE[situacoes[i]]]}>
                          {SITUACAO_DA_LICENCA_LABEL[situacoes[i]]}
                        </Selo>
                      </td>
                    </LinhaFiltravel>
                  ))}
                </tbody>
              </table>
            </div>
            </TabelaFiltravel>
          )}
        </Card>

        <Card as="section" className={SECAO}>
          <h2 className={TITULO}>Exigências</h2>
          {visao.exigencias.length === 0 ? (
            <p className="text-[length:var(--fs-ui)] text-fg-muted">Nenhuma exigência nos processos desta empresa.</p>
          ) : (
            <TabelaFiltravel
              linhas={visao.exigencias.map((e) => ({
                id: e.id,
                valores: {
                  processo: e.tipoNome,
                  orgao: e.orgaoNome,
                  prazo: dia(e.dueAt),
                  situacao: e.resolvedAt ? "Cumprida" : "Aberta",
                },
              }))}
            >
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}>Exigência</th>
                    <th className={TH}>
                      {/* O órgão vem embaixo do processo, e filtra junto. */}
                      <FiltroDaColuna
                        rotulo="Processo"
                        campos={[
                          { chave: "processo", rotulo: "Tipo" },
                          { chave: "orgao", rotulo: "Órgão" },
                        ]}
                      />
                    </th>
                    <th className={TH}><FiltroDaColuna rotulo="Prazo do órgão" chave="prazo" tipo="data" align="right" /></th>
                    <th className={TH}><FiltroDaColuna rotulo="Situação" chave="situacao" align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {visao.exigencias.map((e) => (
                    <LinhaFiltravel key={e.id} id={e.id} className="border-b border-border-soft align-top">
                      <td className={`py-2 pr-3 max-w-[340px] ${e.resolvedAt ? "text-fg-muted" : ""}`}>{e.descricao}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/processos/${e.processoId}`} className={LINK}>
                          {e.tipoNome}
                        </Link>
                        {/* "Apresentação", o termo do roteiro e das taxas — dizia "tentativa". */}
                        <span className="block text-[length:var(--fs-micro)] text-fg-muted">
                          {e.orgaoNome} · {e.tentativa}ª apresentação
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {e.dueAt ? formatInstantDate(e.dueAt) : <span className="text-fg-muted">sem prazo</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {e.resolvedAt ? <Selo tom="sucesso">Cumprida</Selo> : <Selo tom="atencao">Aberta</Selo>}
                      </td>
                    </LinhaFiltravel>
                  ))}
                </tbody>
              </table>
            </div>
            </TabelaFiltravel>
          )}
        </Card>

        <Card as="section" className={SECAO}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={TITULO}>Taxas</h2>
            {visao.taxas.length > 0 && (
              <p className="text-[length:var(--fs-ui)] tabular-nums">
                <strong>{moeda(visao.custo.totalCentavos)}</strong>
                <span className="text-fg-muted"> · {moeda(visao.custo.pagoCentavos)} pagos</span>
                {aPagar > 0 && <span className="text-warning"> · {moeda(aPagar)} a pagar</span>}
              </p>
            )}
          </div>
          {visao.custo.custoDasVoltasCentavos > 0 && (
            <p className="text-[length:var(--fs-2)] text-warning">
              {moeda(visao.custo.custoDasVoltasCentavos)} vieram de reapresentação.
            </p>
          )}
          {visao.taxas.length === 0 ? (
            <p className="text-[length:var(--fs-ui)] text-fg-muted">Nenhuma taxa registrada.</p>
          ) : (
            <TabelaFiltravel
              linhas={visao.taxas.map((t) => ({
                id: t.id,
                valores: {
                  taxa: t.descricao,
                  processo: t.processoId ? (t.tipoNome ?? "") : "avulsa",
                  vencimento: dia(t.dueDate),
                  situacao: t.paidAt ? "Paga" : "Em aberto",
                },
              }))}
            >
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[600px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className={TH}><FiltroDaColuna rotulo="Taxa" chave="taxa" /></th>
                    <th className={TH}><FiltroDaColuna rotulo="Processo" chave="processo" /></th>
                    <th className={TH}>Valor</th>
                    <th className={TH}><FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" align="right" /></th>
                    <th className={TH}><FiltroDaColuna rotulo="Situação" chave="situacao" align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {visao.taxas.map((t) => (
                    <LinhaFiltravel key={t.id} id={t.id} className="border-b border-border-soft">
                      <td className="py-2 pr-3">
                        {t.descricao}
                        {t.attempt !== null && t.attempt >= 2 && (
                          <span className="block text-[length:var(--fs-micro)] text-warning">{t.attempt}ª apresentação</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {t.processoId ? (
                          <Link href={`/processos/${t.processoId}`} className={LINK}>
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
                        {t.paidAt ? <Selo tom="sucesso">Paga</Selo> : <Selo tom="atencao">Em aberto</Selo>}
                      </td>
                    </LinhaFiltravel>
                  ))}
                </tbody>
              </table>
            </div>
            </TabelaFiltravel>
          )}
        </Card>

        <Card as="section" className={SECAO}>
          <h2 className={TITULO}>Processos encerrados</h2>
          {visao.encerrados.length === 0 ? (
            <p className="text-[length:var(--fs-ui)] text-fg-muted">Nenhum processo concluído ou cancelado.</p>
          ) : (
            <div>
              {visao.encerrados.map((p) => (
                <LinhaDeProcesso key={p.id} p={p} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
