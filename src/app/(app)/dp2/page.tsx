import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { CampoMes } from "@/components/ui/CampoMes";
import { Button } from "@/components/ui/Button";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { brl, mesAtual, nomeDaCompetencia, NOME_DA_SITUACAO, NOME_DO_TIPO_DE_COMPETENCIA, TOM_DA_SITUACAO } from "@/lib/dp2/tela";
import type { TotaisDaCompetencia } from "@/lib/dp2/servidor";

/**
 * Painel do DP 2 (11/11/2026): as competências do mês de todas as empresas,
 * pela etapa em que estão. Não segue a faixa da empresa — é a visão do
 * escritório —, mas com uma empresa em foco mostra só o grupo dela.
 */
export default async function PainelDoDp2({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const params = await searchParams;
  const { ctx } = await abrirTelaDoModulo("dp2_painel");
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : mesAtual();
  const [ano, m] = mes.split("-").map(Number);
  const foco = (await podeUsarOFoco(ctx)) ? await lerEmpresaEmFoco(ctx) : null;

  const competencias = await getPrisma().dp2Competencia.findMany({
    where: { tenantId: ctx.tenantId, ano, mes: m, ...(foco ? { companyId: { in: foco.grupo } } : {}) },
    include: { company: { select: { id: true, name: true, tradeName: true, displayName: true } }, _count: { select: { eventos: true } } },
    orderBy: [{ situacao: "asc" }],
  });
  const ordenadas = competencias.sort((a, b) => nomeExibicao(a.company).localeCompare(nomeExibicao(b.company), "pt-BR"));
  const porSituacao = { ABERTA: 0, CALCULADA: 0, FECHADA: 0 } as Record<string, number>;
  for (const c of ordenadas) porSituacao[c.situacao] = (porSituacao[c.situacao] ?? 0) + 1;

  return (
    <PageContainer>
      <PageHeader
        title="Painel do DP 2"
        subtitle={`As competências de ${nomeDaCompetencia(ano, m)}${foco ? ` do grupo de ${foco.nome}` : " de todas as empresas"}, pela etapa em que estão.`}
      />
      <FormularioDeFiltro className="flex flex-wrap items-center gap-3 mb-5">
        <CampoMes name="mes" defaultValue={mes} aria-label="Mês" compact />
        <Button type="submit" variant="secondary" size="sm">
          Ver mês
        </Button>
        <span className="text-fs-2 text-fg-muted">
          {porSituacao.ABERTA} aberta(s) · {porSituacao.CALCULADA} calculada(s) · {porSituacao.FECHADA} fechada(s)
        </span>
      </FormularioDeFiltro>

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
    </PageContainer>
  );
}
