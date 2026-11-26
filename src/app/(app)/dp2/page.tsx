import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { MesDoPainel } from "@/components/dp2/MesDoPainel";
import { EmpresaDoPainel } from "@/components/dp2/EmpresaDoPainel";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { brl, mesAtual, nomeDaCompetencia, NOME_DA_SITUACAO, NOME_DO_TIPO_DE_COMPETENCIA, TOM_DA_SITUACAO } from "@/lib/dp2/tela";
import { avisosDasEmpresas, type TotaisDaCompetencia } from "@/lib/dp2/servidor";
import { NOME_DO_AVISO } from "@/lib/dp2/avisos";
import { hojeIso } from "@/lib/datas/calendario";

/**
 * Painel do DP 2 (11/11/2026): as competências do mês de todas as empresas,
 * pela etapa em que estão. É a visão do escritório: abre com todas, e o filtro
 * de empresa escolhe uma (17/11/2026, melhoria-741). Antes seguia a empresa em
 * foco, e como o painel não tem a faixa de abas, não havia como ver todas.
 */
export default async function PainelDoDp2({ searchParams }: { searchParams: Promise<{ mes?: string; empresa?: string }> }) {
  const params = await searchParams;
  const { ctx } = await abrirTelaDoModulo("dp2_painel");
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : mesAtual();
  const [ano, m] = mes.split("-").map(Number);
  const foco = (await podeUsarOFoco(ctx)) ? await lerEmpresaEmFoco(ctx) : null;
  const prisma = getPrisma();

  // As empresas do filtro: as que já usam o DP 2 (têm alguma competência).
  const comCompetencia = await prisma.dp2Competencia.findMany({
    where: { tenantId: ctx.tenantId },
    distinct: ["companyId"],
    select: { company: { select: { id: true, name: true, tradeName: true, displayName: true } } },
  });
  const empresas = comCompetencia
    .map((c) => ({ id: c.company.id, nome: nomeExibicao(c.company) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const filtro = empresas.find((c) => c.id === params.empresa) ?? null;

  const competencias = await prisma.dp2Competencia.findMany({
    where: { tenantId: ctx.tenantId, ano, mes: m, ...(filtro ? { companyId: filtro.id } : {}) },
    include: { company: { select: { id: true, name: true, tradeName: true, displayName: true } }, _count: { select: { eventos: true } } },
    orderBy: [{ situacao: "asc" }],
  });
  const ordenadas = competencias.sort((a, b) => nomeExibicao(a.company).localeCompare(nomeExibicao(b.company), "pt-BR"));
  const porSituacao = { ABERTA: 0, CALCULADA: 0, FECHADA: 0 } as Record<string, number>;
  for (const c of ordenadas) porSituacao[c.situacao] = (porSituacao[c.situacao] ?? 0) + 1;

  // Avisos (funcionalidade-757): os vencimentos dos colaboradores e os alertas do cálculo do mês.
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const [avisos, calculosComAlerta] = await Promise.all([
    avisosDasEmpresas(ctx.tenantId, filtro ? [filtro.id] : empresas.map((e) => e.id), hojeIso()),
    ordenadas.length > 0
      ? prisma.dp2Calculo.findMany({
          where: { tenantId: ctx.tenantId, competenciaId: { in: ordenadas.map((c) => c.id) } },
          select: { competenciaId: true, personId: true, alertas: true, person: { select: { name: true } } },
        })
      : [],
  ]);
  const empresaDaCompetencia = new Map(ordenadas.map((c) => [c.id, nomeExibicao(c.company)]));
  const alertasDoCalculo = calculosComAlerta
    .flatMap((c) => ((c.alertas as string[] | null) ?? []).map((texto) => ({ competenciaId: c.competenciaId, personId: c.personId, nome: c.person.name, texto })))
    .sort((a, b) => (empresaDaCompetencia.get(a.competenciaId) ?? "").localeCompare(empresaDaCompetencia.get(b.competenciaId) ?? "", "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <PageContainer>
      <PageHeader
        title="Painel do DP 2"
        subtitle={`${nomeDaCompetencia(ano, m)} · ${filtro ? filtro.nome : "todas as empresas"}`}
      />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <MesDoPainel mes={mes} />
        {empresas.length > 1 && <EmpresaDoPainel empresa={filtro?.id ?? ""} empresas={empresas} emFoco={foco?.companyId ?? null} />}
        <span className="text-fs-2 text-fg-muted">
          {porSituacao.ABERTA} aberta(s) · {porSituacao.CALCULADA} calculada(s) · {porSituacao.FECHADA} fechada(s)
        </span>
      </div>

      {ordenadas.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet />}
          title="Nenhuma competência neste mês"
          description="Escolha a empresa na faixa acima e abra a competência em Competência do mês."
          action={<Button href="/dp2/competencia">Ir para Competência do mês</Button>}
        />
      ) : (
        <Secao titulo={`${ordenadas.length} competência(s)`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Empresa</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Situação</th>
                  <th className={TH_NUM}>Pessoas</th>
                  <th className={TH_NUM}>Lançamentos</th>
                  <th className={TH_NUM}>Líquido</th>
                  <th className={TH_NUM}>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((c) => {
                  const t = (c.totais ?? null) as TotaisDaCompetencia | null;
                  return (
                    <tr key={c.id} className={TR}>
                      <td className={TD}>
                        <Link href={`/dp2/competencia/${c.id}`} className="text-brand hover:underline font-medium">
                          {nomeExibicao(c.company)}
                        </Link>
                      </td>
                      <td className={TD}>{NOME_DO_TIPO_DE_COMPETENCIA[c.tipo] ?? c.tipo}</td>
                      <td className={TD}>
                        <Selo tom={TOM_DA_SITUACAO[c.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[c.situacao] ?? c.situacao}</Selo>
                      </td>
                      <td className={TD_NUM}>{t?.pessoas ?? "—"}</td>
                      <td className={TD_NUM}>{c._count.eventos}</td>
                      <td className={TD_NUM}>{t ? brl(t.liquido) : "—"}</td>
                      <td className={TD_NUM}>{t?.alertas ? <span className="text-warning-fg">{t.alertas}</span> : t ? 0 : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {alertasDoCalculo.length > 0 && (
        <Secao titulo={`Avisos do cálculo (${alertasDoCalculo.length})`} apoio={`O que o cálculo de ${nomeDaCompetencia(ano, m)} apontou em cada pessoa.`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Empresa</th>
                  <th className={TH}>Colaborador</th>
                  <th className={TH}>Aviso</th>
                </tr>
              </thead>
              <tbody>
                {alertasDoCalculo.map((a, i) => (
                  <tr key={`${a.competenciaId}-${a.personId}-${i}`} className={TR}>
                    <td className={TD}>{empresaDaCompetencia.get(a.competenciaId)}</td>
                    <td className={TD}>
                      <Link href={`/dp2/competencia/${a.competenciaId}?etapa=conferir&pessoa=${a.personId}`} className="text-brand hover:underline font-medium">
                        {a.nome}
                      </Link>
                    </td>
                    <td className={TD}>{a.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao
        titulo={`Avisos de vencimento (${avisos.length})`}
        apoio={avisos.length === 0 ? "Nada vencendo: férias, contratos por prazo, estágios e dependentes em dia." : "Férias, contratos por prazo determinado, estágios e dependentes, do vencido ao mais distante."}
      >
        {avisos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Colaborador</th>
                  <th className={TH}>Aviso</th>
                  <th className={TH}>Data</th>
                  <th className={TH}>O que fazer</th>
                </tr>
              </thead>
              <tbody>
                {avisos.map((a, i) => (
                  <tr key={`${a.personId}-${a.tipo}-${i}`} className={TR}>
                    <td className={TD}>
                      <Link href={`/dp2/colaboradores?empresa=${a.companyId}&pessoa=${a.personId}`} className="text-brand hover:underline font-medium">
                        {a.nome}
                      </Link>
                      {!filtro && <span className="block text-fs-2 text-fg-muted">{nomeDaEmpresa.get(a.companyId)}</span>}
                    </td>
                    <td className={TD}>
                      <Selo tom={a.vencido ? "perigo" : "atencao"}>{NOME_DO_AVISO[a.tipo]}</Selo>
                    </td>
                    <td className={`${TD} tabular-nums whitespace-nowrap`}>{a.data.split("-").reverse().join("/")}</td>
                    <td className={TD}>{a.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </PageContainer>
  );
}
