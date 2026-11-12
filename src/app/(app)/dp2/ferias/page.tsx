import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { Secao } from "@/components/dp2/Secao";
import { Recibo } from "@/components/dp2/Recibo";
import { formatCalendarDate } from "@/lib/format";
import { semVinculo } from "@/lib/dp2/categorias";
import { colaboradoresDaEmpresa, mediaDaPessoa, tabelasDoEscritorio, vinculoDoMotor } from "@/lib/dp2/servidor";
import { calcularFerias } from "@/lib/dp2/ferias";
import { lerInteiro } from "@/lib/dp2/entrada";
import { tabelasDaCompetencia } from "@/lib/dp2/tabelas";
import { abrirTelaDeEmpresaDoDp2, brl } from "@/lib/dp2/tela";

type Params = { empresa?: string; pessoa?: string; inicio?: string; dias?: string; abono?: string; faltas?: string };

/**
 * Férias no DP 2 (11/11/2026): o recibo de férias de um colaborador, com a
 * média das variáveis das competências fechadas e a memória de cada verba.
 * Calcula sem gravar: o recibo e o lançamento na competência são da fase
 * seguinte.
 */
export default async function FeriasDoDp2({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_ferias", params.empresa);
  const cabecalho = (
    <PageHeader title="Férias" subtitle="O cálculo de férias de um colaborador da empresa escolhida na faixa acima, com abono, médias e a conta de cada verba." />
  );
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EmptyState icon={<CalendarClock />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  const pessoas = (await colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id)).filter((p) => p.dp2Vinculo && !p.dismissalDate && !semVinculo(p.dp2Vinculo.categoria));
  const pessoa = params.pessoa ? pessoas.find((p) => p.id === params.pessoa) : undefined;
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(params.inicio ?? "") ? params.inicio! : null;
  const dias = lerInteiro(params.dias ?? "30") ?? 30;
  const abono = lerInteiro(params.abono ?? "0") ?? 0;
  const faltas = lerInteiro(params.faltas ?? "0") ?? 0;

  let resultado: React.ReactNode = null;
  if (pessoa?.dp2Vinculo && inicio) {
    const competencia = inicio.slice(0, 7);
    const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(tela.tenantId));
    if (!tab.ok) {
      resultado = <Aviso tom="perigo">Faltam tabelas para {competencia}: {tab.faltam.join(", ")}.</Aviso>;
    } else {
      const media = await mediaDaPessoa(tela.tenantId, pessoa.id, competencia);
      const c = calcularFerias({
        inicio: new Date(`${inicio}T00:00:00.000Z`),
        diasDeGozo: dias,
        diasDeAbono: abono,
        faltas,
        vinculo: vinculoDoMotor(pessoa.dp2Vinculo),
        mediaVariaveis: media.media,
        tabelas: tab.tabelas,
      });
      resultado = !c.ok ? (
        <Aviso tom="perigo">{c.erro}</Aviso>
      ) : (
        <Secao
          titulo={`Férias de ${pessoa.name}`}
          apoio={`De ${formatCalendarDate(new Date(`${inicio}T00:00:00.000Z`))} a ${formatCalendarDate(c.fim)}. Pagar até ${formatCalendarDate(c.pagamentoAte)}. FGTS ${brl(c.fgts)}.`}
        >
          <ul className="text-fs-2 text-fg-muted mb-4 space-y-0.5">
            {c.memoria.map((m) => (
              <li key={m}>{m}</li>
            ))}
            <li>Média: {media.memoria}</li>
          </ul>
          <Recibo linhas={c.linhas} proventos={c.proventos} descontos={c.descontos} liquido={c.liquido} alertas={c.alertas} />
        </Secao>
      );
    }
  }

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      {pessoas.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Ninguém com contrato no DP 2"
          description="Crie o contrato dos colaboradores em Colaboradores para calcular as férias."
          action={<Button href="/dp2/colaboradores">Ir para Colaboradores</Button>}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Secao titulo="Calcular férias" apoio="Até 30 dias de direito; o abono vai até 1/3 dele. Faltas injustificadas no período reduzem o direito.">
            <FormularioDeFiltro className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_0.6fr_0.6fr_0.6fr_auto] items-end">
              <CampoForm label="Colaborador" htmlFor="pessoa">
                <Select id="pessoa" name="pessoa" defaultValue={pessoa?.id ?? ""} required>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Início do gozo" htmlFor="inicio">
                <CampoData id="inicio" name="inicio" defaultValue={inicio ?? ""} required />
              </CampoForm>
              <CampoForm label="Dias" htmlFor="dias">
                <Input id="dias" name="dias" inputMode="numeric" defaultValue={String(dias)} />
              </CampoForm>
              <CampoForm label="Abono" htmlFor="abono">
                <Input id="abono" name="abono" inputMode="numeric" defaultValue={String(abono)} />
              </CampoForm>
              <CampoForm label="Faltas" htmlFor="faltas">
                <Input id="faltas" name="faltas" inputMode="numeric" defaultValue={String(faltas)} />
              </CampoForm>
              <Button type="submit">Calcular</Button>
            </FormularioDeFiltro>
            <p className="text-fs-2 text-fg-muted mt-3">
              Falta alguém?{" "}
              <Link href="/dp2/colaboradores" className="text-brand hover:underline">
                Só aparece quem tem contrato no DP 2
              </Link>
              .
            </p>
          </Secao>
          {resultado}
        </div>
      )}
    </PageContainer>
  );
}
