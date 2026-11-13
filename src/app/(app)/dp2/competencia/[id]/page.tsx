import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Plus } from "lucide-react";
import { PassosDaCompetencia, type PassoDaCompetencia } from "@/components/dp2/PassosDaCompetencia";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltroDaEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { canActOnSector, canManageSector, getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { formatCpf, formatInstantDateTime } from "@/lib/format";
import { num } from "@/lib/dp2/formato";
import { colaboradoresDaCompetencia, listarRubricas, type TotaisDaCompetencia } from "@/lib/dp2/servidor";
import { PAPEIS_LANCAVEIS, ehPapel } from "@/lib/dp2/rubricas";
import { compararValores, type CampoComparado } from "@/lib/dp2/comparativo";
import { brl, nomeDaCompetencia, NOME_DA_SITUACAO, NOME_DO_TIPO_DE_COMPETENCIA, TOM_DA_SITUACAO } from "@/lib/dp2/tela";
import type { Encargos, ItemDoHolerite, Provisoes } from "@/lib/dp2/mensal";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoData } from "@/components/ui/CampoData";
import { LinkDoCliente } from "@/components/dp2/LinkDoCliente";
import { lancamentosDaCompetencia } from "@/lib/dp2/saidas";
import { NOME_DA_FORMA } from "@/lib/dp2/cnab240";
import {
  calcularCompetenciaAction,
  cancelarPedidoDeEventosAction,
  fecharCompetenciaAction,
  gerarRemessaAction,
  guardarHoleritesAction,
  importarComparativoAction,
  importarEventosAction,
  lancarEventoAction,
  pedirEventosAoClienteAction,
  reabrirCompetenciaAction,
  removerEventoAction,
} from "../../actions";

const n = (v: unknown) => Number(v ?? 0);
type Etapa = "abrir" | "eventos" | "calcular" | "conferir" | "fechar";
const NOME_DA_ORIGEM: Record<string, string> = { DP: "DP", PLANILHA: "Planilha", PONTO: "Pontomais", CLIENTE: "Cliente" };
const NOME_DO_CAMPO: Record<CampoComparado, string> = { proventos: "Proventos", descontos: "Descontos", liquido: "Líquido", inss: "INSS", irrf: "IRRF", fgts: "FGTS" };

/**
 * Uma competência do DP 2 (11/11/2026): lançar os eventos do mês, calcular,
 * conferir (holerite com memória de cálculo e comparativo com a Domínio) e
 * fechar.
 */
export default async function CompetenciaDoDp2({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pessoa?: string; etapa?: string }> }) {
  const { id } = await params;
  const { pessoa: pessoaAberta, etapa: etapaPedida } = await searchParams;
  // A mesma tela abre as parcelas do 13º: vale o módulo da competência ou o do 13º.
  const modulo = (await podeNoModulo(await getAuthContext(), "dp2_competencia", "ver")) ? "dp2_competencia" : "dp2_decimo";
  const { ctx, setor } = await abrirTelaDoModulo(modulo);
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { company: { select: { id: true, name: true, displayName: true } } },
  });
  if (!comp) notFound();
  const empresa = nomeExibicao(comp.company);
  const foco = (await podeUsarOFoco(ctx)) ? await lerEmpresaEmFoco(ctx) : null;
  const titulo = `${NOME_DO_TIPO_DE_COMPETENCIA[comp.tipo] ?? comp.tipo} · ${nomeDaCompetencia(comp.ano, comp.mes)}`;

  if (foco && !foco.grupo.includes(comp.companyId)) {
    return (
      <PageContainer>
        <PageHeader title={titulo} subtitle={empresa} />
        <Aviso tom="atencao">
          Esta competência é de {empresa}, e você está trabalhando em {foco.nome}. Troque a empresa na faixa acima para abrir esta folha.
        </Aviso>
      </PageContainer>
    );
  }

  const podeAgir = canActOnSector(ctx, setor);
  const podeGerir = canManageSector(ctx, setor);
  const fechada = comp.situacao === "FECHADA";
  const mensal = comp.tipo === "MENSAL";

  const [calculos, eventos, comparativos, rubricas, pessoas, pedidos, remessas] = await Promise.all([
    prisma.dp2Calculo.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, include: { person: { select: { id: true, name: true, cpf: true } } } }),
    prisma.dp2Evento.findMany({
      where: { tenantId: ctx.tenantId, competenciaId: id },
      include: { person: { select: { name: true } }, rubrica: { select: { codigo: true, nome: true, lancamento: true, papel: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dp2Comparativo.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id } }),
    listarRubricas(ctx.tenantId),
    colaboradoresDaCompetencia(ctx.tenantId, comp.companyId, comp.ano, comp.mes),
    prisma.dp2PedidoDeEventos.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.dp2Remessa.findMany({
      where: { tenantId: ctx.tenantId, competenciaId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, nomeArquivo: true, dataPagamento: true, quantidade: true, total: true, foraDaRemessa: true, createdAt: true },
    }),
  ]);
  const pedidoAtual = pedidos.find((p) => p.situacao !== "CANCELADO") ?? null;
  const contabil = calculos.length > 0 ? await lancamentosDaCompetencia(ctx.tenantId, id) : null;
  const urlPublica = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"));
  const totais = (comp.totais ?? null) as TotaisDaCompetencia | null;
  const semContrato = pessoas.filter((p) => !p.dp2Vinculo);
  const lancaveis = rubricas.filter((r) => r.ativa && (r.papel ? ehPapel(r.papel) && PAPEIS_LANCAVEIS.has(r.papel) : r.tipo !== "INFORMATIVA"));
  const comparativoDe = new Map(comparativos.map((c) => [c.personId, c]));
  const aberto = pessoaAberta ? calculos.find((c) => c.personId === pessoaAberta) : undefined;

  let divergentes = 0;
  const diferencaDe = new Map<string, ReturnType<typeof compararValores>>();
  for (const c of calculos) {
    const d = comparativoDe.get(c.personId);
    if (!d) continue;
    const r = compararValores(
      { proventos: n(c.proventos), descontos: n(c.descontos), liquido: n(c.liquido), inss: n(c.inss), irrf: n(c.irrf), fgts: n(c.fgts) },
      { proventos: d.proventos === null ? null : n(d.proventos), descontos: d.descontos === null ? null : n(d.descontos), liquido: d.liquido === null ? null : n(d.liquido), inss: d.inss === null ? null : n(d.inss), irrf: d.irrf === null ? null : n(d.irrf), fgts: d.fgts === null ? null : n(d.fgts) }
    );
    diferencaDe.set(c.personId, r);
    if (r.diverge) divergentes++;
  }

  // O passo a passo (13/11/2026): cada etapa mostra só a sua parte da tela.
  // Abrir, os eventos/contratos e o cálculo ficam liberados enquanto a
  // competência existe (sem eventos, a folha sai só com o salário); conferir,
  // depois de calcular; fechar, com a folha calculada e sem lançamento novo.
  const calculada = calculos.length > 0;
  const etapas: { chave: Etapa; nome: string; feita: boolean; liberada: boolean }[] = [
    { chave: "abrir", nome: "Abrir", feita: true, liberada: true },
    { chave: "eventos", nome: mensal ? "Lançar eventos" : "Conferir contratos", feita: eventos.length > 0 || !mensal || comp.situacao !== "ABERTA", liberada: true },
    { chave: "calcular", nome: "Calcular", feita: comp.situacao !== "ABERTA", liberada: true },
    { chave: "conferir", nome: "Conferir", feita: fechada, liberada: calculada },
    { chave: "fechar", nome: "Fechar", feita: fechada, liberada: comp.situacao !== "ABERTA" },
  ];
  const sugerida: Etapa = fechada ? "fechar" : comp.situacao === "CALCULADA" ? "conferir" : calculada ? "calcular" : "eventos";
  const pedida = etapas.find((e) => e.chave === etapaPedida && e.liberada);
  const etapa: Etapa = pedida?.chave ?? (pessoaAberta && calculada ? "conferir" : sugerida);
  const indice = etapas.findIndex((e) => e.chave === etapa);
  const hrefDa = (e: Etapa) => `/dp2/competencia/${comp.id}?etapa=${e}`;
  const anterior = indice > 0 ? etapas[indice - 1] : undefined;
  const proxima = etapas[indice + 1]?.liberada ? etapas[indice + 1] : undefined;
  const passos: PassoDaCompetencia[] = etapas.map((e) => ({
    label: e.nome,
    href: hrefDa(e.chave),
    status: e.chave === etapa ? "current" : e.feita ? "done" : "upcoming",
    disabled: !e.liberada,
  }));
  const avisoSemContrato = semContrato.length > 0 && (
    <Aviso tom="info">
      {semContrato.length} colaborador(es) da empresa sem contrato no DP 2 ficam fora do cálculo:{" "}
      {semContrato.slice(0, 6).map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link className="text-brand hover:underline" href={`/dp2/colaboradores?pessoa=${p.id}`}>
            {p.name}
          </Link>
        </span>
      ))}
      {semContrato.length > 6 && "…"}
    </Aviso>
  );
  const comContrato = pessoas.filter((p) => p.dp2Vinculo);

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        subtitle={
          <>
            <Link href="/dp2/competencia" className="text-brand hover:underline">
              {empresa}
            </Link>
            {comp.calculadaEm && <> · calculada em {formatInstantDateTime(comp.calculadaEm)}</>}
          </>
        }
        meta={<Selo tom={TOM_DA_SITUACAO[comp.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[comp.situacao] ?? comp.situacao}</Selo>}
      />
      <FiltroDaEmpresa foco={foco ? { ...foco, pedida: null } : null} />

      <PassosDaCompetencia passos={passos} />

      {totais && etapa !== "abrir" && etapa !== "eventos" && (
        <div className="mb-5">
          <FaixaDeTotais
            itens={[
              { rotulo: "Pessoas", valor: String(totais.pessoas), detalhe: totais.semVinculo ? `${totais.semVinculo} sem contrato no DP 2` : undefined },
              { rotulo: "Proventos", valor: brl(totais.proventos) },
              { rotulo: "Líquido", valor: brl(totais.liquido) },
              { rotulo: "INSS", valor: brl(totais.inss) },
              { rotulo: "IRRF", valor: brl(totais.irrf) },
              { rotulo: "FGTS", valor: brl(totais.fgts) },
              { rotulo: "Custo de encargos", valor: brl(totais.encargos), detalhe: "INSS patronal, RAT, terceiros e FGTS" },
              { rotulo: "Provisões", valor: brl(totais.provisoes), detalhe: "Férias, 1/3, 13º e encargos" },
            ]}
          />
        </div>
      )}

      {comp.situacao === "ABERTA" && calculos.length > 0 && (
        <Aviso tom="atencao" className="mb-5">
          Houve lançamento depois do último cálculo: calcule de novo antes de conferir.
        </Aviso>
      )}

      {podeAgir && (etapa === "calcular" || etapa === "fechar") && (
        <div className="flex flex-wrap items-start gap-4 mb-6">
          {!fechada && etapa === "calcular" && (
            <FormularioDoDp2 acao={calcularCompetenciaAction} rotulo={calculos.length ? "Calcular de novo" : "Calcular a folha"} rotuloEnviando="Calculando…">
              <input type="hidden" name="competenciaId" value={comp.id} />
            </FormularioDoDp2>
          )}
          {comp.situacao === "CALCULADA" && etapa === "fechar" && (
            <FormularioDoDp2 acao={fecharCompetenciaAction} rotulo="Fechar competência" rotuloEnviando="Fechando…" variante="secondary">
              <input type="hidden" name="competenciaId" value={comp.id} />
            </FormularioDoDp2>
          )}
          {fechada && podeGerir && etapa === "fechar" && (
            <FormularioDoDp2 acao={reabrirCompetenciaAction} rotulo="Reabrir" rotuloEnviando="Reabrindo…" variante="secondary" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="competenciaId" value={comp.id} />
              <CampoForm label="Por que reabrir" htmlFor="motivo">
                <Input id="motivo" name="motivo" placeholder="Ex.: comissão lançada a menor" className="w-72" required />
              </CampoForm>
            </FormularioDoDp2>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {(etapa === "abrir" || etapa === "calcular") && avisoSemContrato}

        {etapa === "abrir" && (
          <Secao titulo="Competência aberta" apoio="O que entra nesta folha. Para mudar quem entra, ajuste os contratos em Colaboradores.">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-fs-3">
              <div>
                <dt className="text-fs-2 text-fg-muted">Empresa</dt>
                <dd className="font-medium">{empresa}</dd>
              </div>
              <div>
                <dt className="text-fs-2 text-fg-muted">Folha</dt>
                <dd className="font-medium">{titulo}</dd>
              </div>
              <div>
                <dt className="text-fs-2 text-fg-muted">Com contrato no DP 2</dt>
                <dd className="font-medium">{comContrato.length} colaborador(es)</dd>
              </div>
              <div>
                <dt className="text-fs-2 text-fg-muted">Situação</dt>
                <dd>
                  <Selo tom={TOM_DA_SITUACAO[comp.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[comp.situacao] ?? comp.situacao}</Selo>
                </dd>
              </div>
            </dl>
          </Secao>
        )}

        {etapa === "eventos" && !mensal && (
          <>
            {avisoSemContrato}
            <Secao
              titulo="Quem entra no 13º"
              apoio="O 13º sai do salário do contrato e das médias. Confira os salários antes de calcular; para corrigir, abra o contrato em Colaboradores."
            >
              {comContrato.length === 0 ? (
                <p className="text-fs-3 text-fg-muted">
                  Ninguém com contrato no DP 2.{" "}
                  <Link href="/dp2/colaboradores" className="text-brand hover:underline">
                    Criar contratos
                  </Link>
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-fs-3">
                    <thead>
                      <tr>
                        <th className={TH}>Colaborador</th>
                        <th className={`${TH_NUM} pr-10`}>Salário</th>
                        <th className={TH}>
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {comContrato.map((p) => (
                        <tr key={p.id} className={TR}>
                          <td className={`${TD} align-middle`}>{p.name}</td>
                          <td className={`${TD_NUM} align-middle pr-10`}>
                            {brl(n(p.dp2Vinculo!.salarioBase))}
                            {p.dp2Vinculo!.tipoSalario === "HORISTA" ? "/h" : ""}
                          </td>
                          <td className={`${TD} align-middle text-right pr-0`}>
                            <Button href={`/dp2/colaboradores?pessoa=${p.id}`} variant="secondary" size="sm" aria-label={`Editar o contrato de ${p.name}`}>
                              <Pencil size={14} aria-hidden="true" />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>
          </>
        )}

        {mensal && etapa === "eventos" && (
          <Secao titulo="Eventos do mês" apoio="Horas extras, adicional noturno, faltas e atrasos em horas ou dias; comissões, adiantamentos e outros em valor. O motor calcula o resto (salário, DSR, INSS, IRRF, FGTS).">
            {podeAgir && !fechada && (
              <FormularioDoDp2 acao={lancarEventoAction} rotulo="Lançar" rotuloEnviando="Lançando…" className="mb-5" icone={<Plus size={14} aria-hidden="true" />}>
                <input type="hidden" name="competenciaId" value={comp.id} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_0.7fr_0.8fr_1.2fr]">
                  <CampoForm label="Colaborador" htmlFor="personId">
                    <Select id="personId" name="personId" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {pessoas
                        .filter((p) => p.dp2Vinculo)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Rubrica" htmlFor="rubricaId">
                    <Select id="rubricaId" name="rubricaId" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {lancaveis.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigo} · {r.nome}
                          {r.papel && r.lancamento !== "VALOR" ? ` (${r.lancamento === "HORAS" ? "horas" : "dias"})` : ""}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Horas ou dias" htmlFor="quantidade">
                    <Input id="quantidade" name="quantidade" inputMode="decimal" placeholder="10,5" />
                  </CampoForm>
                  <CampoForm label="Valor" htmlFor="valor">
                    <Input id="valor" name="valor" inputMode="decimal" prefix="R$" placeholder="0,00" />
                  </CampoForm>
                  <CampoForm label="Observação" htmlFor="observacao">
                    <Input id="observacao" name="observacao" maxLength={300} />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            )}
            {eventos.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">Nenhum lançamento. Sem eventos, a folha sai só com salário e adicionais fixos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Colaborador</th>
                      <th className={TH}>Rubrica</th>
                      <th className={TH_NUM}>Horas/dias</th>
                      <th className={TH_NUM}>Valor</th>
                      <th className={TH}>Origem</th>
                      <th className={TH}>Observação</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((e) => (
                      <tr key={e.id} className={TR}>
                        <td className={TD}>{e.person.name}</td>
                        <td className={TD}>
                          {e.rubrica.codigo} · {e.rubrica.nome}
                        </td>
                        <td className={TD_NUM}>{e.quantidade !== null ? num(n(e.quantidade)) : "—"}</td>
                        <td className={TD_NUM}>{e.valor !== null ? brl(n(e.valor)) : "—"}</td>
                        <td className={TD}>{NOME_DA_ORIGEM[e.origem] ?? e.origem}</td>
                        <td className={`${TD} text-fg-muted`}>{e.observacao ?? ""}</td>
                        <td className={`${TD} text-right`}>
                          {podeAgir && !fechada && (
                            <FormularioDoDp2 acao={removerEventoAction} rotulo="Retirar" rotuloEnviando="Retirando…" variante="ghost" tamanho="xs">
                              <input type="hidden" name="eventoId" value={e.id} />
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
        )}

        {mensal && etapa === "eventos" && !fechada && podeAgir && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Secao
              titulo="Pedir os eventos ao cliente"
              apoio="Um link sem login em que a empresa informa horas extras, faltas, atrasos e comissões de cada colaborador, ou que não houve nada. O que ela mandar entra aqui como lançamento de origem Cliente."
            >
              {pedidoAtual ? (
                <div className="flex flex-col gap-3">
                  <p className="text-fs-2">
                    {pedidoAtual.situacao === "RESPONDIDO" ? (
                      <Selo tom="sucesso">{pedidoAtual.semEventos ? "Cliente disse que não houve eventos" : "Cliente respondeu"}</Selo>
                    ) : pedidoAtual.expiraEm < new Date() ? (
                      <Selo tom="perigo">Link vencido</Selo>
                    ) : (
                      <Selo tom="atencao">Aguardando o cliente</Selo>
                    )}
                    <span className="text-fg-muted">
                      {" "}
                      {pedidoAtual.respondidoEm ? `em ${formatInstantDateTime(pedidoAtual.respondidoEm)}` : `vale até ${formatInstantDateTime(pedidoAtual.expiraEm)}`}
                    </span>
                  </p>
                  {pedidoAtual.observacao && <Aviso tom="info">Recado do cliente: {pedidoAtual.observacao}</Aviso>}
                  <LinkDoCliente token={pedidoAtual.token} urlPublica={urlPublica} />
                  <div className="flex flex-wrap gap-3">
                    <FormularioDoDp2 acao={pedirEventosAoClienteAction} rotulo="Gerar outro link" rotuloEnviando="Gerando…" variante="ghost" tamanho="sm">
                      <input type="hidden" name="competenciaId" value={comp.id} />
                    </FormularioDoDp2>
                    {pedidoAtual.situacao === "ABERTO" && (
                      <FormularioDoDp2 acao={cancelarPedidoDeEventosAction} rotulo="Cancelar o link" rotuloEnviando="Cancelando…" variante="ghost" tamanho="sm">
                        <input type="hidden" name="pedidoId" value={pedidoAtual.id} />
                      </FormularioDoDp2>
                    )}
                  </div>
                </div>
              ) : (
                <FormularioDoDp2 acao={pedirEventosAoClienteAction} rotulo="Gerar o link" rotuloEnviando="Gerando…" variante="secondary">
                  <input type="hidden" name="competenciaId" value={comp.id} />
                </FormularioDoDp2>
              )}
            </Secao>

            <Secao
              titulo="Importar planilha ou Pontomais"
              apoio="Copie do Excel ou do relatório de totais do Pontomais e cole aqui, com o cabeçalho. Coluna CPF ou Nome, e uma coluna por evento: HE 50%, HE 100%, Noturno, Faltas, Atrasos, ou o código/nome da rubrica. Horas em 10:30 ou 10,5."
            >
              <FormularioDoDp2 acao={importarEventosAction} rotulo="Importar" rotuloEnviando="Lendo…" variante="secondary">
                <input type="hidden" name="competenciaId" value={comp.id} />
                <Textarea name="texto" rows={5} className="font-mono text-fs-2" placeholder={"Nome\tCPF\tHE 50%\tFaltas\tComissões\nJoana Ribeiro\t123.456.789-09\t10:30\t1\t250,00"} aria-label="Planilha colada" />
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <CampoForm label="De onde veio" htmlFor="origem">
                    <Select id="origem" name="origem" defaultValue="PLANILHA" compact>
                      <option value="PLANILHA">Planilha do cliente</option>
                      <option value="PONTO">Relatório do Pontomais</option>
                    </Select>
                  </CampoForm>
                  <Checkbox id="trocar" name="trocar" defaultChecked label="Trocar o que já veio desta origem (não duplica)" />
                </div>
              </FormularioDoDp2>
            </Secao>
          </div>
        )}

        {etapa === "calcular" && !calculada && (
          <p className="text-fs-3 text-fg-muted">Calcule a folha para ver os totais e o resultado de cada pessoa no passo Conferir.</p>
        )}

        {etapa === "conferir" && (
          <Secao
            titulo="Resultado do cálculo"
            apoio={
              calculos.length === 0
                ? "Calcule a folha para ver o resultado de cada pessoa."
                : `Clique no nome para ver o holerite com a memória de cálculo.${comparativos.length ? ` ${divergentes} pessoa(s) diferem da Domínio em mais de 1 centavo.` : ""}`
            }
          >
            {calculos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Colaborador</th>
                      <th className={TH_NUM}>Proventos</th>
                      <th className={TH_NUM}>INSS</th>
                      <th className={TH_NUM}>IRRF</th>
                      <th className={TH_NUM}>Descontos</th>
                      <th className={TH_NUM}>Líquido</th>
                      <th className={TH_NUM}>FGTS</th>
                      <th className={TH}>Conferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculos.map((c) => {
                      const alertas = (c.alertas as string[]) ?? [];
                      const dif = diferencaDe.get(c.personId);
                      return (
                        <tr key={c.id} className={`${TR} ${c.personId === pessoaAberta ? "bg-surface-hover" : ""}`}>
                          <td className={TD}>
                            <Link href={`/dp2/competencia/${comp.id}?etapa=conferir&pessoa=${c.personId}#holerite`} scroll={false} className="text-brand hover:underline font-medium">
                              {c.person.name}
                            </Link>
                          </td>
                          <td className={TD_NUM}>{brl(n(c.proventos))}</td>
                          <td className={TD_NUM}>{brl(n(c.inss))}</td>
                          <td className={TD_NUM}>{brl(n(c.irrf))}</td>
                          <td className={TD_NUM}>{brl(n(c.descontos))}</td>
                          <td className={`${TD_NUM} font-medium`}>{brl(n(c.liquido))}</td>
                          <td className={TD_NUM}>{brl(n(c.fgts))}</td>
                          <td className={TD}>
                            <div className="flex flex-wrap gap-1">
                              {alertas.length > 0 && <Selo tom="atencao">{alertas.length} alerta(s)</Selo>}
                              {dif && (dif.diverge ? <Selo tom="perigo">difere da Domínio</Selo> : <Selo tom="sucesso">bate com a Domínio</Selo>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        )}

        {etapa === "conferir" && aberto && (
          <div id="holerite">
            <Holerite
              nome={aberto.person.name}
              cpf={aberto.person.cpf}
              itens={(aberto.itens as unknown as ItemDoHolerite[]) ?? []}
              memoria={aberto.memoria as { inss?: string[]; irrf?: string[]; diasTrabalhados?: number }}
              encargos={aberto.encargos as unknown as Encargos}
              provisoes={aberto.provisoes as unknown as Provisoes}
              alertas={(aberto.alertas as string[]) ?? []}
              totais={{ proventos: n(aberto.proventos), descontos: n(aberto.descontos), liquido: n(aberto.liquido), baseInss: n(aberto.baseInss), baseIrrf: n(aberto.baseIrrf), baseFgts: n(aberto.baseFgts) }}
              diferencas={diferencaDe.get(aberto.personId)?.diferencas}
              fecharHref={hrefDa("conferir")}
              pdfHref={`/api/dp2/competencias/${comp.id}/holerites?pessoa=${aberto.personId}`}
            />
          </div>
        )}

        {etapa === "fechar" && calculada && (
          <Secao
            titulo="Saídas da folha"
            apoio={fechada ? "Holerites, arquivo do banco e lançamentos contábeis desta competência." : "Os holerites e os lançamentos já dão para conferir; guardar nos Arquivos e gerar o arquivo do banco ficam liberados ao fechar a competência."}
          >
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <h3 className="text-fs-3 font-semibold text-fg">Holerites</h3>
                <p className="text-fs-2 text-fg-muted">Um PDF com uma página por colaborador. Guardados em Arquivos › Departamento Pessoal, seguem ao cliente pelo “Enviar ao cliente” do arquivo.</p>
                <Button href={`/api/dp2/competencias/${comp.id}/holerites`} variant="secondary" size="sm" download>
                  Baixar holerites (PDF)
                </Button>
                {fechada && podeAgir && (
                  <FormularioDoDp2 acao={guardarHoleritesAction} rotulo="Guardar nos Arquivos" rotuloEnviando="Guardando…" variante="ghost" tamanho="sm">
                    <input type="hidden" name="competenciaId" value={comp.id} />
                  </FormularioDoDp2>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-fs-3 font-semibold text-fg">Arquivo do banco (CNAB 240)</h3>
                <p className="text-fs-2 text-fg-muted">
                  O pagamento do líquido de cada um pela conta pagadora da empresa. Quem está sem banco, agência, conta ou CPF fica de fora (e aparece aqui).
                </p>
                {fechada && podeAgir ? (
                  <FormularioDoDp2 acao={gerarRemessaAction} rotulo="Gerar remessa" rotuloEnviando="Gerando…" variante="secondary" tamanho="sm" className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="competenciaId" value={comp.id} />
                    <CampoForm label="Data do pagamento" htmlFor="dataPagamento">
                      <CampoData id="dataPagamento" name="dataPagamento" required />
                    </CampoForm>
                  </FormularioDoDp2>
                ) : (
                  <p className="text-fs-2 text-fg-muted">Feche a competência para gerar.</p>
                )}
                {remessas.length > 0 && (
                  <ul className="flex flex-col gap-2 text-fs-2">
                    {remessas.map((r) => {
                      const fora = (r.foraDaRemessa as { nome: string; motivo: string }[]) ?? [];
                      return (
                        <li key={r.id} className="border-t border-border pt-2">
                          <a href={`/api/dp2/remessas/${r.id}`} download className="text-brand hover:underline font-medium">
                            {r.nomeArquivo}
                          </a>
                          <span className="text-fg-muted">
                            {" "}
                            · {r.quantidade} pagamento(s), {brl(n(r.total))}, pagar em {r.dataPagamento.split("-").reverse().join("/")}
                          </span>
                          {fora.length > 0 && <span className="block text-warning-fg">Fora: {fora.map((f) => `${f.nome} (${f.motivo})`).join(", ")}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-fs-1 text-fg-muted">Formas: {(["01", "05", "41"] as const).map((f) => NOME_DA_FORMA[f]).join(", ")}. O primeiro arquivo de cada banco vai para teste no banco antes de valer.</p>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-fs-3 font-semibold text-fg">Lançamentos contábeis</h3>
                <p className="text-fs-2 text-fg-muted">
                  {contabil ? `${contabil.lancamentos.length} lançamento(s) em ${contabil.data.split("-").reverse().join("/")}, pelas contas das rubricas e das contas da folha.` : ""}
                </p>
                <Button href={`/api/dp2/competencias/${comp.id}/lancamentos`} variant="secondary" size="sm" download>
                  Baixar lançamentos (CSV)
                </Button>
                {contabil && contabil.faltam.length > 0 && (
                  <Aviso tom="atencao">
                    Faltam contas: {contabil.faltam.slice(0, 4).join("; ")}
                    {contabil.faltam.length > 4 ? "…" : "."}{" "}
                    <Link href="/dp2/rubricas" className="underline">
                      Configurar em Rubricas
                    </Link>
                  </Aviso>
                )}
              </div>
            </div>
          </Secao>
        )}

        {etapa === "conferir" && (
          <Secao
            titulo="Comparar com a Domínio"
            apoio="Enquanto o DP 2 roda em paralelo: cole, uma pessoa por linha, CPF; proventos; descontos; líquido; INSS; IRRF; FGTS (pode copiar direto do Excel). Campo vazio não é comparado."
          >
            {podeAgir ? (
              <FormularioDoDp2 acao={importarComparativoAction} rotulo="Comparar" rotuloEnviando="Lendo…" variante="secondary">
                <input type="hidden" name="competenciaId" value={comp.id} />
                <Textarea name="texto" rows={4} placeholder={"123.456.789-09; 3.243,89; 277,87; 2.966,02; 277,87; 0,00; 259,51"} aria-label="Valores da Domínio" />
              </FormularioDoDp2>
            ) : (
              <p className="text-fs-3 text-fg-muted">{comparativos.length} pessoa(s) com valores da Domínio.</p>
            )}
          </Secao>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
        {anterior ? (
          <Button href={hrefDa(anterior.chave)} variant="secondary" scroll={false}>
            <ArrowLeft size={14} aria-hidden="true" />
            {anterior.nome}
          </Button>
        ) : (
          <span />
        )}
        {proxima && (
          <Button href={hrefDa(proxima.chave)} variant="secondary" scroll={false}>
            {proxima.nome}
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        )}
      </div>
    </PageContainer>
  );
}

function Holerite({
  nome,
  cpf,
  itens,
  memoria,
  encargos,
  provisoes,
  alertas,
  totais,
  diferencas,
  fecharHref,
  pdfHref,
}: {
  nome: string;
  cpf: string | null;
  itens: ItemDoHolerite[];
  memoria: { inss?: string[]; irrf?: string[]; diasTrabalhados?: number };
  encargos: Encargos;
  provisoes: Provisoes;
  alertas: string[];
  totais: { proventos: number; descontos: number; liquido: number; baseInss: number; baseIrrf: number; baseFgts: number };
  diferencas?: Partial<Record<CampoComparado, number>>;
  fecharHref: string;
  pdfHref: string;
}) {
  const linhas = itens.filter((i) => i.tipo !== "INFORMATIVA");
  const informativas = itens.filter((i) => i.tipo === "INFORMATIVA");
  return (
    <Secao
      titulo={`Holerite de ${nome}`}
      apoio={`${cpf ? `CPF ${formatCpf(cpf)} · ` : ""}${memoria.diasTrabalhados ?? 30} dia(s) no mês`}
      acao={
        <div className="flex gap-2">
          <Button href={pdfHref} variant="secondary" size="sm" download>
            PDF
          </Button>
          <Button href={fecharHref} variant="ghost" size="sm" scroll={false}>
            Fechar holerite
          </Button>
        </div>
      }
    >
      {alertas.length > 0 && (
        <Aviso tom="atencao" className="mb-4">
          <ul className="list-disc pl-4">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-fs-3">
          <thead>
            <tr>
              <th className={TH}>Cód.</th>
              <th className={TH}>Rubrica</th>
              <th className={TH}>Ref.</th>
              <th className={TH_NUM}>Proventos</th>
              <th className={TH_NUM}>Descontos</th>
              <th className={TH}>Como foi calculado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((i, k) => (
              <tr key={`${i.codigo}-${k}`} className={TR}>
                <td className={`${TD} text-fg-muted tabular-nums`}>{i.codigo}</td>
                <td className={TD}>{i.nome}</td>
                <td className={`${TD} whitespace-nowrap`}>{i.referencia}</td>
                <td className={TD_NUM}>{i.tipo === "PROVENTO" ? brl(i.valor) : ""}</td>
                <td className={TD_NUM}>{i.tipo === "DESCONTO" ? brl(i.valor) : ""}</td>
                <td className={`${TD} text-fs-2 text-fg-muted max-w-[42ch]`}>{i.memoria}</td>
              </tr>
            ))}
            <tr className={`${TR} font-semibold`}>
              <td className={TD} />
              <td className={TD}>Totais</td>
              <td className={TD} />
              <td className={TD_NUM}>{brl(totais.proventos)}</td>
              <td className={TD_NUM}>{brl(totais.descontos)}</td>
              <td className={TD}>Líquido {brl(totais.liquido)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-5 text-fs-2">
        <div>
          <h3 className="font-semibold text-fg mb-1">Bases</h3>
          <p>INSS {brl(totais.baseInss)}</p>
          <p>IRRF {brl(totais.baseIrrf)}</p>
          <p>FGTS {brl(totais.baseFgts)}</p>
          {informativas.map((i) => (
            <p key={i.codigo}>
              {i.nome}: {brl(i.valor)}
            </p>
          ))}
        </div>
        <div>
          <h3 className="font-semibold text-fg mb-1">INSS</h3>
          <ul className="text-fg-muted space-y-0.5">{(memoria.inss ?? []).map((l) => <li key={l}>{l}</li>)}</ul>
          <h3 className="font-semibold text-fg mt-3 mb-1">IRRF</h3>
          <ul className="text-fg-muted space-y-0.5">{(memoria.irrf ?? []).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        <div>
          <h3 className="font-semibold text-fg mb-1">Custo para a empresa</h3>
          <ul className="text-fg-muted space-y-0.5">{encargos.memoria.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-1">Total {brl(encargos.total)}</p>
          <h3 className="font-semibold text-fg mt-3 mb-1">Provisões do mês</h3>
          <ul className="text-fg-muted space-y-0.5">{provisoes.memoria.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-1">Total {brl(provisoes.total)}</p>
        </div>
      </div>

      {diferencas && Object.keys(diferencas).length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold text-fg text-fs-2 mb-1">Diferença para a Domínio (DP 2 − Domínio)</h3>
          <p className="text-fs-2">
            {(Object.entries(diferencas) as [CampoComparado, number][]).map(([campo, d], i) => (
              <span key={campo} className={Math.abs(d) > 0.01 ? "text-danger font-medium" : "text-fg-muted"}>
                {i > 0 && " · "}
                {NOME_DO_CAMPO[campo]} {d > 0 ? "+" : ""}
                {brl(d)}
              </span>
            ))}
          </p>
        </div>
      )}
    </Secao>
  );
}
