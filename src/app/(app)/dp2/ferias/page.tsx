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
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { getPrisma } from "@/lib/prisma";
import { NOME_DA_SITUACAO_DO_PERIODO, periodoSugerido, type SituacaoDoPeriodo } from "@/lib/dp2/periodosDeFerias";
import { excluirFeriasAction, gravarFeriasAction } from "../actions";
import { Recibo } from "@/components/dp2/Recibo";
import { formatCalendarDate } from "@/lib/format";
import { semVinculo } from "@/lib/dp2/categorias";
import { colaboradoresDaEmpresa, mediaDaPessoa, periodosDaPessoa, tabelasDoEscritorio, vinculoDoMotor } from "@/lib/dp2/servidor";
import { calcularFerias } from "@/lib/dp2/ferias";
import { lerInteiro } from "@/lib/dp2/entrada";
import { tabelasDaCompetencia } from "@/lib/dp2/tabelas";
import { abrirTelaDeEmpresaDoDp2, brl } from "@/lib/dp2/tela";

type Params = { empresa?: string; pessoa?: string; inicio?: string; dias?: string; abono?: string; faltas?: string };

const TOM_DO_PERIODO: Record<SituacaoDoPeriodo, TomDoSelo> = { EM_AQUISICAO: "neutro", A_GOZAR: "atencao", EM_DOBRO: "perigo", QUITADO: "sucesso" };
const dataIso = (d: Date) => d.toISOString().slice(0, 10);
const comoData = (s: string) => formatCalendarDate(new Date(`${s}T00:00:00.000Z`));

/**
 * Férias no DP 2 (11/11/2026): o recibo de férias de um colaborador, com a
 * média das variáveis das competências fechadas e a memória de cada verba.
 * Desde 25/11/2026 (funcionalidade-745, entrega 2.1) grava as férias no
 * período aquisitivo, e a folha dos meses do gozo lança a parte de cada mês.
 * Aviso e recibo em PDF, programação e férias coletivas são da entrega 2.2.
 */
export default async function FeriasDoDp2({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_ferias", params.empresa);
  const cabecalho = <PageHeader title="Férias" />;
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

  const periodos = pessoa ? await periodosDaPessoa(tela.tenantId, pessoa) : [];
  // Para gravar, vale a situação no dia em que o gozo começa (dá para programar férias futuras).
  const periodosNoGozo = pessoa && inicio ? await periodosDaPessoa(tela.tenantId, pessoa, new Date(`${inicio}T00:00:00.000Z`)) : [];
  const sugerido = periodoSugerido(periodosNoGozo);
  const comSaldo = periodosNoGozo.filter((p) => p.situacao === "A_GOZAR");
  const gravadas = await getPrisma().dp2Ferias.findMany({
    where: { tenantId: tela.tenantId, companyId: tela.empresa.id },
    include: { person: { select: { name: true } } },
    orderBy: { inicioGozo: "desc" },
    take: 50,
  });

  let resultado: React.ReactNode = null;
  if (pessoa?.dp2Vinculo && inicio) {
    const competencia = inicio.slice(0, 7);
    const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(tela.tenantId));
    if (!tab.ok) {
      resultado = <Aviso tom="perigo">Faltam tabelas para {competencia}: {tab.faltam.join(", ")}.</Aviso>;
    } else {
      const media = await mediaDaPessoa(tela.tenantId, pessoa.id, competencia, "FERIAS");
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
          {tela.podeAgir &&
            (comSaldo.length === 0 ? (
              <Aviso tom="atencao" className="mt-4">
                {periodosNoGozo.some((p) => p.situacao === "EM_DOBRO")
                  ? "Há período que passou do concessivo: as férias são devidas em dobro (CLT art. 137), e o DP 2 ainda não calcula a dobra."
                  : "Nenhum período aquisitivo completo com saldo no início deste gozo."}
              </Aviso>
            ) : (
              <FormularioDoDp2 acao={gravarFeriasAction} rotulo="Gravar férias" rotuloEnviando="Gravando…" className="mt-5 border-t border-border pt-5">
                <input type="hidden" name="companyId" value={tela.empresa.id} />
                <input type="hidden" name="personId" value={pessoa.id} />
                <input type="hidden" name="inicio" value={inicio} />
                <input type="hidden" name="dias" value={dias} />
                <input type="hidden" name="abono" value={abono} />
                <input type="hidden" name="faltas" value={faltas} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr]">
                  <CampoForm label="Período aquisitivo" htmlFor="aquisitivoInicio" dica="O mais antigo vencido com saldo vem escolhido.">
                    <Select id="aquisitivoInicio" name="aquisitivoInicio" defaultValue={sugerido?.situacao === "A_GOZAR" ? sugerido.inicio : comSaldo[0].inicio}>
                      {comSaldo.map((p) => (
                        <option key={p.inicio} value={p.inicio}>
                          {comoData(p.inicio)} a {comoData(p.fim)} · saldo {p.saldo} dias
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Data do pagamento" htmlFor="dataPagamento" dica="Até 2 dias antes do início (CLT art. 145).">
                    <CampoData id="dataPagamento" name="dataPagamento" defaultValue={dataIso(c.pagamentoAte)} required />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            ))}
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
          {/* A linha de apoio e o "Falta alguém?" viraram o "?" dos campos
              (17/11/2026, melhoria-707). */}
          <Secao titulo="Calcular férias">
            <FormularioDeFiltro className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_0.6fr_0.6fr_0.6fr_auto] items-end">
              <CampoForm label="Colaborador" htmlFor="pessoa" dica="Só aparece quem tem contrato no DP 2, em Colaboradores.">
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
              <CampoForm label="Dias" htmlFor="dias" dica="Até 30 dias de direito.">
                <Input id="dias" name="dias" inputMode="numeric" defaultValue={String(dias)} />
              </CampoForm>
              <CampoForm label="Abono" htmlFor="abono" dica="Até 1/3 dos dias de direito.">
                <Input id="abono" name="abono" inputMode="numeric" defaultValue={String(abono)} />
              </CampoForm>
              <CampoForm label="Faltas" htmlFor="faltas" dica="Faltas injustificadas no período reduzem o direito.">
                <Input id="faltas" name="faltas" inputMode="numeric" defaultValue={String(faltas)} />
              </CampoForm>
              <Button type="submit">Calcular</Button>
            </FormularioDeFiltro>
          </Secao>
          {pessoa && (
            <Secao titulo={`Períodos aquisitivos de ${pessoa.name}`}>
              {periodos.length === 0 ? (
                <p className="text-fs-3 text-fg-muted">Sem data de admissão no cadastro: preencha para ver os períodos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-fs-3">
                    <thead>
                      <tr>
                        <th className={TH}>Período aquisitivo</th>
                        <th className={TH}>Conceder até</th>
                        <th className={TH_NUM}>Direito</th>
                        <th className={TH_NUM}>Usados</th>
                        <th className={TH_NUM}>Saldo</th>
                        <th className={TH_NUM}>1/3 pago</th>
                        <th className={TH}>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodos.map((p) => (
                        <tr key={p.inicio} className={TR}>
                          <td className={TD}>
                            {comoData(p.inicio)} a {comoData(p.fim)}
                          </td>
                          <td className={TD}>{comoData(p.concessivoFim)}</td>
                          <td className={TD_NUM}>{p.direito}</td>
                          <td className={TD_NUM}>{p.usados}</td>
                          <td className={TD_NUM}>{p.saldo}</td>
                          <td className={TD_NUM}>{brl(p.tercoPago)}</td>
                          <td className={TD}>
                            <Selo tom={TOM_DO_PERIODO[p.situacao]}>{NOME_DA_SITUACAO_DO_PERIODO[p.situacao]}</Selo>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>
          )}
          {resultado}
          <Secao titulo="Férias gravadas">
            {gravadas.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">Nenhuma férias gravada nesta empresa.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Colaborador</th>
                      <th className={TH}>Período aquisitivo</th>
                      <th className={TH}>Gozo</th>
                      <th className={TH_NUM}>Dias + abono</th>
                      <th className={TH}>Pagamento</th>
                      <th className={TH_NUM}>Líquido</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {gravadas.map((g) => (
                      <tr key={g.id} className={TR}>
                        <td className={TD}>{g.person.name}</td>
                        <td className={TD}>
                          {formatCalendarDate(g.aquisitivoInicio)} a {formatCalendarDate(g.aquisitivoFim)}
                        </td>
                        <td className={TD}>
                          {formatCalendarDate(g.inicioGozo)} a {formatCalendarDate(new Date(g.inicioGozo.getTime() + (g.diasGozo - 1) * 86_400_000))}
                        </td>
                        <td className={TD_NUM}>
                          {g.diasGozo}
                          {g.diasAbono > 0 ? ` + ${g.diasAbono}` : ""}
                        </td>
                        <td className={TD}>{formatCalendarDate(g.dataPagamento)}</td>
                        <td className={TD_NUM}>{brl(Number(g.liquido))}</td>
                        <td className={`${TD} text-right`}>
                          {tela.podeAgir && (
                            <FormularioDoDp2
                              acao={excluirFeriasAction}
                              rotulo="Excluir"
                              rotuloEnviando="Excluindo…"
                              variante="ghost"
                              tamanho="xs"
                              confirmar={{ titulo: "Excluir estas férias?", texto: "O período aquisitivo volta a ter o saldo, e a folha dos meses do gozo precisa ser calculada de novo.", rotulo: "Excluir" }}
                            >
                              <input type="hidden" name="feriasId" value={g.id} />
                            </FormularioDoDp2>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        </div>
      )}
    </PageContainer>
  );
}
