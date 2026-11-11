import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDeEmpresaDoDp2, brl, mesAtual, nomeDaCompetencia, NOME_DA_SITUACAO, NOME_DO_TIPO_DE_COMPETENCIA, TOM_DA_SITUACAO } from "@/lib/dp2/tela";
import type { TotaisDaCompetencia } from "@/lib/dp2/servidor";
import { abrirCompetenciaAction } from "@/app/(app)/dp2/actions";

/**
 * As competências do DP 2 da empresa em foco (11/11/2026): a folha de cada mês
 * e as parcelas do 13º, da mais nova para a mais antiga, e o "Abrir
 * competência". Serve a duas telas: Competência do mês (todas) e 13º salário
 * (só as parcelas), cada uma com o seu módulo.
 */
export async function TelaDeCompetencias({ modulo, empresaPedida, soDecimo }: { modulo: string; empresaPedida?: string; soDecimo: boolean }) {
  const tela = await abrirTelaDeEmpresaDoDp2(modulo, empresaPedida);

  const cabecalho = soDecimo ? (
    <PageHeader
      title="13º salário"
      subtitle="As duas parcelas do 13º da empresa escolhida na faixa acima: a 1ª até 30 de novembro (metade, sem INSS e IRRF) e a 2ª até 20 de dezembro (o ano inteiro, com INSS e IRRF próprios, descontando a 1ª)."
    />
  ) : (
    <PageHeader
      title="Competência do mês"
      subtitle="A folha da empresa escolhida na faixa acima: lance os eventos do mês, calcule, confira e feche."
    />
  );
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} porQue="A folha é calculada por empresa." /> : <EmptyState icon={<FileSpreadsheet />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  const competencias = await getPrisma().dp2Competencia.findMany({
    where: { tenantId: tela.tenantId, companyId: tela.empresa.id, ...(soDecimo ? { tipo: { in: ["DECIMO_1", "DECIMO_2"] } } : {}) },
    orderBy: [{ ano: "desc" }, { mes: "desc" }, { tipo: "asc" }],
    take: 36,
  });

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Secao titulo={`Competências de ${tela.empresa.nome}`} apoio="A competência fechada é a que vale para as médias de férias, 13º e rescisão.">
          {competencias.length === 0 ? (
            <p className="text-fs-3 text-fg-muted">Nenhuma competência ainda. Abra a primeira ao lado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Mês</th>
                    <th className={TH}>Tipo</th>
                    <th className={TH}>Situação</th>
                    <th className={TH_NUM}>Pessoas</th>
                    <th className={TH_NUM}>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {competencias.map((c) => {
                    const t = (c.totais ?? null) as TotaisDaCompetencia | null;
                    return (
                      <tr key={c.id} className={TR}>
                        <td className={TD}>
                          <Link href={`/dp2/competencia/${c.id}`} className="text-brand hover:underline font-medium">
                            {nomeDaCompetencia(c.ano, c.mes)}
                          </Link>
                        </td>
                        <td className={TD}>{NOME_DO_TIPO_DE_COMPETENCIA[c.tipo] ?? c.tipo}</td>
                        <td className={TD}>
                          <Selo tom={TOM_DA_SITUACAO[c.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[c.situacao] ?? c.situacao}</Selo>
                        </td>
                        <td className={TD_NUM}>{t?.pessoas ?? "—"}</td>
                        <td className={TD_NUM}>{t ? brl(t.liquido) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        {tela.podeAgir && (
          <Secao titulo="Abrir competência" apoio="Se ela já existe, abre a que existe.">
            <FormularioDoDp2 acao={abrirCompetenciaAction} rotulo="Abrir" rotuloEnviando="Abrindo…">
              <input type="hidden" name="companyId" value={tela.empresa.id} />
              <div className="flex flex-col gap-4">
                <CampoForm label="Mês" htmlFor="competencia">
                  <CampoMes id="competencia" name="competencia" defaultValue={mesAtual()} required />
                </CampoForm>
                <CampoForm label="Tipo" htmlFor="tipo">
                  <Select id="tipo" name="tipo" defaultValue={soDecimo ? "DECIMO_1" : "MENSAL"}>
                    <option value="MENSAL">Folha mensal</option>
                    <option value="DECIMO_1">13º — 1ª parcela</option>
                    <option value="DECIMO_2">13º — 2ª parcela (dezembro)</option>
                  </Select>
                </CampoForm>
              </div>
            </FormularioDoDp2>
          </Secao>
        )}
      </div>
    </PageContainer>
  );
}
