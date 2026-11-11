import Link from "next/link";
import { FileSignature } from "lucide-react";
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
import { colaboradoresDaEmpresa, mediaDaPessoa, tabelasDoEscritorio, vinculoDoMotor } from "@/lib/dp2/servidor";
import { calcularRescisaoDoDp2 } from "@/lib/dp2/rescisao";
import { lerInteiro, lerNumero } from "@/lib/dp2/entrada";
import { tabelasDaCompetencia } from "@/lib/dp2/tabelas";
import { MOTIVO_LABEL, type MotivoCanonico } from "@/lib/rescisao/motivos";
import { abrirTelaDeEmpresaDoDp2, brl } from "@/lib/dp2/tela";

type Params = {
  empresa?: string;
  pessoa?: string;
  desligamento?: string;
  motivo?: string;
  aviso?: string;
  vencidos?: string;
  faltas?: string;
  saldoFgts?: string;
  adiantado?: string;
};

const MOTIVOS = Object.keys(MOTIVO_LABEL) as MotivoCanonico[];

/**
 * Rescisões no DP 2 (11/11/2026): as verbas do cálculo de rescisão do Connect
 * com INSS, IRRF e FGTS pelas tabelas do DP 2. Calcula sem gravar: o TRCT e o
 * S-2299 são das fases seguintes.
 */
export default async function RescisoesDoDp2({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_rescisoes", params.empresa);
  const cabecalho = (
    <PageHeader title="Rescisões" subtitle="As verbas rescisórias de um colaborador da empresa escolhida na faixa acima, com INSS, IRRF e FGTS e a conta de cada verba." />
  );
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EmptyState icon={<FileSignature />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  const pessoas = (await colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id)).filter((p) => p.dp2Vinculo);
  const pessoa = params.pessoa ? pessoas.find((p) => p.id === params.pessoa) : undefined;
  const desligamento = /^\d{4}-\d{2}-\d{2}$/.test(params.desligamento ?? "")
    ? params.desligamento!
    : pessoa?.dismissalDate
      ? pessoa.dismissalDate.toISOString().slice(0, 10)
      : null;
  const motivo = (MOTIVOS as string[]).includes(params.motivo ?? "") ? (params.motivo as MotivoCanonico) : "DISPENSA_SEM_JUSTA_CAUSA";
  const aviso = params.aviso ?? "INDENIZADO";
  const vencidos = Math.max(0, Math.min(2, lerInteiro(params.vencidos ?? "0") ?? 0));
  const faltas = lerInteiro(params.faltas ?? "0") ?? 0;
  const saldoFgts = lerNumero(params.saldoFgts ?? "");
  const adiantado = lerNumero(params.adiantado ?? "") ?? 0;

  let resultado: React.ReactNode = null;
  if (pessoa?.dp2Vinculo && desligamento) {
    if (!pessoa.admissionDate) {
      resultado = <Aviso tom="perigo">{pessoa.name} está sem data de admissão no cadastro: preencha em Colaboradores de clientes.</Aviso>;
    } else {
      const competencia = desligamento.slice(0, 7);
      const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(tela.tenantId));
      if (!tab.ok) {
        resultado = <Aviso tom="perigo">Faltam tabelas para {competencia}: {tab.faltam.join(", ")}.</Aviso>;
      } else {
        const media = await mediaDaPessoa(tela.tenantId, pessoa.id, competencia);
        const c = calcularRescisaoDoDp2({
          motivo,
          admissao: pessoa.admissionDate,
          desligamento: new Date(`${desligamento}T00:00:00.000Z`),
          avisoIndenizado: aviso === "INDENIZADO",
          avisoDispensado: aviso === "DISPENSADO",
          vinculo: vinculoDoMotor(pessoa.dp2Vinculo),
          mediaVariaveis: media.media,
          periodosVencidos: vencidos,
          faltas,
          saldoFgts,
          decimoAdiantado: adiantado,
          tabelas: tab.tabelas,
        });
        resultado = (
          <Secao
            titulo={`Rescisão de ${pessoa.name}`}
            apoio={`${MOTIVO_LABEL[motivo]} · admitido em ${formatCalendarDate(pessoa.admissionDate)}, desligado em ${formatCalendarDate(new Date(`${desligamento}T00:00:00.000Z`))}. FGTS na guia: ${brl(c.fgts)}${c.multaFgts !== null ? ` + multa ${brl(c.multaFgts)}` : ""}.`}
          >
            {c.faltando.length > 0 && (
              <Aviso tom="info" className="mb-4">
                {c.faltando.join(" ")}
              </Aviso>
            )}
            <p className="text-fs-2 text-fg-muted mb-4">Média de variáveis: {media.memoria}</p>
            <Recibo
              linhas={c.linhas.map((l) => ({ nome: l.nome, valor: l.valor, tipo: l.tipo, memoria: l.memoria, motivo: l.motivo }))}
              proventos={c.proventos}
              descontos={c.descontos}
              liquido={c.liquido}
              alertas={c.alertas}
            />
          </Secao>
        );
      }
    }
  }

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      {pessoas.length === 0 ? (
        <EmptyState
          icon={<FileSignature />}
          title="Ninguém com contrato no DP 2"
          description="Crie o contrato dos colaboradores em Colaboradores para calcular a rescisão."
          action={<Button href="/dp2/colaboradores">Ir para Colaboradores</Button>}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Secao titulo="Calcular rescisão" apoio="Saldo de salário, aviso, 13º e férias saem do cálculo de rescisão do Connect; INSS, IRRF e FGTS, das tabelas do DP 2.">
            <FormularioDeFiltro className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
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
              <CampoForm label="Último dia trabalhado" htmlFor="desligamento">
                <CampoData id="desligamento" name="desligamento" defaultValue={desligamento ?? ""} required />
              </CampoForm>
              <CampoForm label="Motivo" htmlFor="motivo">
                <Select id="motivo" name="motivo" defaultValue={motivo}>
                  {MOTIVOS.map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Aviso prévio" htmlFor="aviso">
                <Select id="aviso" name="aviso" defaultValue={aviso}>
                  <option value="INDENIZADO">Indenizado</option>
                  <option value="TRABALHADO">Trabalhado</option>
                  <option value="DISPENSADO">Dispensado</option>
                </Select>
              </CampoForm>
              <CampoForm label="Períodos de férias vencidos" htmlFor="vencidos" helper="0, 1 ou 2, não gozados.">
                <Input id="vencidos" name="vencidos" inputMode="numeric" defaultValue={String(vencidos)} />
              </CampoForm>
              <CampoForm label="Faltas no período atual" htmlFor="faltas">
                <Input id="faltas" name="faltas" inputMode="numeric" defaultValue={String(faltas)} />
              </CampoForm>
              <CampoForm label="Saldo do FGTS" htmlFor="saldoFgts" helper="Do extrato, para a multa.">
                <Input id="saldoFgts" name="saldoFgts" inputMode="decimal" prefix="R$" defaultValue={params.saldoFgts ?? ""} />
              </CampoForm>
              <CampoForm label="13º já adiantado" htmlFor="adiantado">
                <Input id="adiantado" name="adiantado" inputMode="decimal" prefix="R$" defaultValue={params.adiantado ?? ""} />
              </CampoForm>
              <div className="lg:col-span-4">
                <Button type="submit">Calcular</Button>
              </div>
            </FormularioDeFiltro>
            <p className="text-fs-2 text-fg-muted mt-3">
              Só aparece quem tem contrato em{" "}
              <Link href="/dp2/colaboradores" className="text-brand hover:underline">
                Colaboradores
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
