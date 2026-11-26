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
import { FocoNaEmpresaDaTela } from "@/components/dp2/FocoNaEmpresaDaTela";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { canActOnSector, canManageSector, getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { formatCpf, formatInstantDateTime } from "@/lib/format";
import { num } from "@/lib/dp2/formato";
import { colaboradoresDaCompetencia, configDaEmpresa, listarRubricas, rubricasFixasDoMes, type TotaisDaCompetencia } from "@/lib/dp2/servidor";
import { TIPOS_DE_INFORMACAO, apurarCompetencia, ehTipoDeInformacao } from "@/lib/dp2/apuracao";
import { competenciaDe } from "@/lib/dp2/tabelas";
import { separarFixasDoMes } from "@/lib/dp2/rubricasFixas";
import { conferirGuias, NOME_DA_SITUACAO_DA_GUIA } from "@/lib/dp2/guiasDaFolha";
import { conferirTotalizadores, type Diferenca } from "@/lib/dp2/esocial/totalizadores";
import { documentoFormatado } from "@/lib/dp2/outrasBasesInss";
import { CATEGORIAS, regimeDaCategoria } from "@/lib/dp2/categorias";
import { camposAjustaveis, nomeDoCampo, type AjusteAplicado } from "@/lib/dp2/ajustesDoCalculo";
import { totaisPorRubrica } from "@/lib/dp2/lancamentoPorRubrica";
import { LancarPorRubrica } from "@/components/dp2/LancarPorRubrica";
import { PAPEIS_LANCAVEIS, ehPapel, regraDeLancamento } from "@/lib/dp2/rubricas";
import { compararValores, type CampoComparado } from "@/lib/dp2/comparativo";
import { brl, nomeDaCompetencia, NOME_DA_SITUACAO, NOME_DO_TIPO_DE_COMPETENCIA, TOM_DA_SITUACAO } from "@/lib/dp2/tela";
import type { Encargos, ItemDoHolerite, Provisoes } from "@/lib/dp2/mensal";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoData } from "@/components/ui/CampoData";
import { LinkDoCliente } from "@/components/dp2/LinkDoCliente";
import { lancamentosDaCompetencia } from "@/lib/dp2/saidas";
import {
  ajustarCalculoAction,
  calcularCompetenciaAction,
  anexarGfdAction,
  importarTotalizadoresAction,
  incluirInformacaoDaApuracaoAction,
  retirarInformacaoDaApuracaoAction,
  copiarOutrasBasesInssAction,
  incluirOutraBaseInssAction,
  retirarOutraBaseInssAction,
  cancelarPedidoDeEventosAction,
  fecharCompetenciaAction,
  gerarRemessaAction,
  guardarHoleritesAction,
  importarComparativoAction,
  importarEventosAction,
  lancarEventoAction,
  lancarPorRubricaAction,
  pedirEventosAoClienteAction,
  reabrirCompetenciaAction,
  removerEventoAction,
  retirarAjusteAction,
} from "../../actions";

const n = (v: unknown) => Number(v ?? 0);
/** Depois de lançar, o colaborador fica para a próxima rubrica (bug-795). */
const MANTER_NO_LANCAMENTO = ["personId"];
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
  const usaFoco = await podeUsarOFoco(ctx);
  const foco = usaFoco ? await lerEmpresaEmFoco(ctx) : null;
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

  const [calculos, eventos, comparativos, rubricas, pessoas, pedidos, remessas, informacoes, cfgDaEmpresa, outrasBases, ajustes] = await Promise.all([
    prisma.dp2Calculo.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, include: { person: { select: { id: true, name: true, cpf: true } } } }),
    prisma.dp2Evento.findMany({
      where: { tenantId: ctx.tenantId, competenciaId: id },
      include: { person: { select: { name: true } }, rubrica: { select: { id: true, codigo: true, nome: true, tipo: true, lancamento: true, papel: true } } },
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
    // Informações da apuração (funcionalidade-769, parte 2): retenções e compensações do mês.
    prisma.dp2InformacaoDaApuracao.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, orderBy: { createdAt: "asc" } }),
    configDaEmpresa(ctx.tenantId, comp.companyId),
    // Outras bases de INSS de quem tem mais de um vínculo (funcionalidade-769).
    prisma.dp2OutraBaseInss.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, orderBy: { createdAt: "asc" } }),
    // Ajustes manuais do cálculo (funcionalidade-768).
    prisma.dp2AjusteDeCalculo.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  const ajustesDe = (personId: string) => ajustes.filter((a) => a.personId === personId);
  const apuracao =
    mensal && calculos.length > 0
      ? apurarCompetencia({
          calculos: calculos.map((c) => ({
            proventos: n(c.proventos),
            inss: n(c.inss),
            irrf: n(c.irrf),
            encargos: c.encargos as unknown as Encargos,
            itens: (c.itens as unknown as ItemDoHolerite[]) ?? [],
            empregado: regimeDaCategoria(pessoas.find((p) => p.id === c.personId)?.dp2Vinculo?.categoria) === "CLT",
          })),
          informacoes: informacoes.map((i) => ({ tipo: i.tipo, valor: n(i.valor) })),
          pisSobreFolha: cfgDaEmpresa.pisSobreFolha,
        })
      : null;
  const pedidoAtual = pedidos.find((p) => p.situacao !== "CANCELADO") ?? null;
  // Guias da folha (funcionalidade-744): o DARF da DCTFWeb baixado pelo Serpro e a GFD anexada.
  const competenciaDasGuias = `${comp.ano}-${String(comp.mes).padStart(2, "0")}`;
  const [guiasDoMes, rotinaDctfweb] = mensal
    ? await Promise.all([
        prisma.guia.findMany({ where: { tenantId: ctx.tenantId, companyId: comp.companyId, competencia: competenciaDasGuias, tipo: { in: ["DCTFWEB", "FGTS"] } }, orderBy: { createdAt: "desc" } }),
        prisma.serproDctfweb.findFirst({ where: { tenantId: ctx.tenantId, companyId: comp.companyId, competencia: competenciaDasGuias }, select: { situacao: true, darfArquivoId: true } }),
      ])
    : [[], null];
  const darfDoMes = guiasDoMes.find((g) => g.tipo === "DCTFWEB");
  const gfdDoMes = guiasDoMes.find((g) => g.tipo === "FGTS");
  // Totalizadores do eSocial (funcionalidade-755): o que o eSocial calculou, contra o cálculo do DP 2.
  const totalizadores = calculos.length > 0 ? await prisma.dp2TotalizadorEsocial.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id } }) : [];
  const conferenciaEsocial =
    totalizadores.length > 0
      ? conferirTotalizadores(
          calculos.map((c) => ({ personId: c.personId, nome: c.person.name, cpf: c.person.cpf, inss: n(c.inss), irrf: n(c.irrf), baseFgts: n(c.baseFgts), fgts: n(c.fgts) })),
          totalizadores.map((t) => ({ tipo: t.tipo as "S-5001", cpf: t.cpf, valores: t.valores as Record<string, number> }))
        )
      : null;
  // As rubricas fixas do contrato que valem no mês: entram no cálculo sozinhas (funcionalidade-767).
  // Fechada, o cálculo já foi: só aparece o que de fato entrou (nos holerites).
  const fixasVigentes = mensal && !fechada
    ? (await rubricasFixasDoMes(ctx.tenantId, pessoas.filter((p) => p.dp2Vinculo).map((p) => p.id), competenciaDe(comp.ano, comp.mes))).filter((f) => f.rubrica.ativa)
    : [];
  // A que o DP lançou no mês para a mesma pessoa e rubrica fica de fora (vale o lançamento).
  const { substituidas } = separarFixasDoMes(fixasVigentes, eventos);
  const fixasDoMes = fixasVigentes.map((f) => ({ ...f, substituida: substituidas.includes(f) }));
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.name]));
  const contabil = calculos.length > 0 ? await lancamentosDaCompetencia(ctx.tenantId, id) : null;
  const urlPublica = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"));
  const totais = (comp.totais ?? null) as TotaisDaCompetencia | null;
  const semContrato = pessoas.filter((p) => !p.dp2Vinculo);
  const lancaveis = rubricas.filter((r) => r.ativa && (r.papel ? ehPapel(r.papel) && PAPEIS_LANCAVEIS.has(r.papel) : r.tipo !== "INFORMATIVA"));
  // Lançar por rubrica e em grupo, e a consulta por rubrica (funcionalidade-767, 1.1).
  const rubricasParaLancar = lancaveis.map((r) => {
    const porQuantidade = regraDeLancamento(r).porQuantidade;
    return { id: r.id, rotulo: `${r.codigo} · ${r.nome}`, unidade: porQuantidade ? (r.lancamento === "DIAS" ? ("dias" as const) : ("horas" as const)) : null };
  });
  const pessoasParaLancar = pessoas.filter((p) => p.dp2Vinculo).map((p) => ({ id: p.id, nome: p.name }));
  const porRubrica = totaisPorRubrica(eventos, fixasDoMes.filter((f) => !f.substituida));
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
      {usaFoco && !foco && <FocoNaEmpresaDaTela companyId={comp.companyId} />}
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

      {totais?.rescindidos && totais.rescindidos.length > 0 && etapa !== "abrir" && (
        <Aviso tom="info" className="mb-5">
          Com rescisão gravada no mês, fora desta folha: {totais.rescindidos.join(", ")}. As verbas do mês estão na rescisão (DP 2 › Rescisões) e vão no S-2299.
        </Aviso>
      )}

      {comp.situacao === "ABERTA" && calculos.length > 0 && (
        <Aviso tom="atencao" className="mb-5">
          Houve lançamento depois do último cálculo: calcule de novo antes de conferir.
        </Aviso>
      )}

      {ajustes.length > 0 && (etapa === "calcular" || etapa === "conferir") && (
        <Aviso tom="info" className="mb-5">
          {ajustes.length === 1 ? "Há 1 ajuste manual" : `Há ${ajustes.length} ajustes manuais`} no cálculo desta competência. Calcular de novo mantém os ajustes; para voltar ao valor do motor, retire o ajuste no holerite da pessoa.
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
            <FormularioDoDp2 acao={fecharCompetenciaAction} rotulo="Fechar competência" rotuloEnviando="Fechando…" variante="secondary"
              confirmar={{ titulo: "Fechar a competência?", rotulo: "Fechar competência", texto: podeGerir
                ? "A competência fechada passa a valer para médias de férias, 13º e rescisão, e libera o arquivo do banco. Para mudar depois, é preciso reabrir com um motivo."
                : "A competência fechada passa a valer para médias de férias, 13º e rescisão, e libera o arquivo do banco. Só o gestor do setor consegue reabrir depois." }}>
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
          <Secao titulo="Competência aberta">
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
            <Secao titulo="Quem entra no 13º">
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
          // As linhas de apoio fixas das seções saíram para o artigo do DP 2
          // (17/11/2026, melhoria-707): ficam só as que trazem dado.
          <Secao titulo="Eventos do mês">
            {podeAgir && !fechada && (
              <FormularioDoDp2 acao={lancarEventoAction} rotulo="Lançar" rotuloEnviando="Lançando…" className="mb-5" icone={<Plus size={14} aria-hidden="true" />} manterAposEnviar={MANTER_NO_LANCAMENTO}>
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
            {eventos.length === 0 && fixasDoMes.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">Nenhum lançamento.</p>
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
                    {fixasDoMes.map((f) => (
                      <tr key={`fixa-${f.id}`} className={`${TR} ${f.substituida ? "text-fg-muted line-through decoration-fg-muted/50" : ""}`.trim()}>
                        <td className={TD}>{nomeDe.get(f.personId) ?? "—"}</td>
                        <td className={TD}>
                          {f.rubrica.codigo} · {f.rubrica.nome}
                        </td>
                        <td className={TD_NUM}>{f.quantidade !== null ? num(n(f.quantidade)) : "—"}</td>
                        <td className={TD_NUM}>{f.valor !== null ? brl(n(f.valor)) : "—"}</td>
                        <td className={TD}>{f.substituida ? <span className="text-fg-muted">Fixa · substituída pelo lançamento do mês</span> : "Fixa do contrato"}</td>
                        <td className={`${TD} text-fg-muted`}>{f.observacao ?? ""}</td>
                        <td className={`${TD} text-right`}>
                          <Link href={`/dp2/colaboradores?pessoa=${f.personId}`} className="text-fs-2 text-brand hover:underline">
                            No contrato
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        )}

        {mensal && etapa === "eventos" && (outrasBases.length > 0 || (podeAgir && !fechada)) && (
          <Secao titulo="Outras bases de INSS (mais de um vínculo)">
            {podeAgir && !fechada && (
              <div className="mb-5 flex flex-col gap-4">
                <FormularioDoDp2 acao={incluirOutraBaseInssAction} rotulo="Incluir" rotuloEnviando="Incluindo…" icone={<Plus size={14} aria-hidden="true" />} manterAposEnviar={["personId"]}>
                  <input type="hidden" name="competenciaId" value={comp.id} />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_1fr_0.9fr]">
                    <CampoForm label="Colaborador" htmlFor="outra-personId">
                      <Select id="outra-personId" name="personId" required defaultValue="">
                        <option value="" disabled>
                          Escolha…
                        </option>
                        {pessoas
                          .filter((p) => p.dp2Vinculo && regimeDaCategoria(p.dp2Vinculo.categoria) === "CLT")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </Select>
                    </CampoForm>
                    <CampoForm label="CNPJ (ou CPF) da outra empresa" htmlFor="outra-documento">
                      <Input id="outra-documento" name="documento" inputMode="numeric" required placeholder="00.000.000/0000-00" />
                    </CampoForm>
                    <CampoForm label="Categoria lá" htmlFor="outra-codCateg">
                      <Select id="outra-codCateg" name="codCateg" defaultValue="101">
                        {CATEGORIAS.map(([codigo, nome]) => (
                          <option key={codigo} value={codigo}>
                            {nome}
                          </option>
                        ))}
                      </Select>
                    </CampoForm>
                    <CampoForm label="Remuneração no mês" htmlFor="outra-remuneracao">
                      <Input id="outra-remuneracao" name="remuneracao" inputMode="decimal" prefix="R$" placeholder="0,00" required />
                    </CampoForm>
                  </div>
                </FormularioDoDp2>
                <FormularioDoDp2 acao={copiarOutrasBasesInssAction} rotulo="Copiar do mês anterior" rotuloEnviando="Copiando…" variante="ghost" tamanho="sm">
                  <input type="hidden" name="competenciaId" value={comp.id} />
                </FormularioDoDp2>
              </div>
            )}
            {outrasBases.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">Ninguém com remuneração em outra empresa neste mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Colaborador</th>
                      <th className={TH}>Outra empresa</th>
                      <th className={TH}>Categoria</th>
                      <th className={TH_NUM}>Remuneração</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {outrasBases.map((o) => (
                      <tr key={o.id} className={TR}>
                        <td className={TD}>{nomeDe.get(o.personId) ?? "—"}</td>
                        <td className={`${TD} tabular-nums`}>{documentoFormatado(o.tpInsc, o.nrInsc)}</td>
                        <td className={TD}>{o.codCateg}</td>
                        <td className={TD_NUM}>{brl(n(o.remuneracao))}</td>
                        <td className={`${TD} text-right`}>
                          {podeAgir && !fechada && (
                            <FormularioDoDp2 acao={retirarOutraBaseInssAction} rotulo="Retirar" rotuloEnviando="Retirando…" variante="ghost" tamanho="xs">
                              <input type="hidden" name="outraBaseId" value={o.id} />
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

        {mensal && etapa === "eventos" && porRubrica.length > 0 && (
          <Secao titulo="Consulta por rubrica">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Rubrica</th>
                    <th className={TH_NUM}>Colaboradores</th>
                    <th className={TH_NUM}>Lançamentos</th>
                    <th className={TH_NUM}>Horas/dias</th>
                    <th className={TH_NUM}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {porRubrica.map((t) => (
                    <tr key={t.rubricaId} className={TR}>
                      <td className={TD}>
                        {t.codigo} · {t.nome}
                        {t.tipo === "DESCONTO" && <span className="ml-2 text-fs-2 text-fg-muted">desconto</span>}
                      </td>
                      <td className={TD_NUM}>{t.pessoas}</td>
                      <td className={TD_NUM}>
                        {t.lancamentos}
                        {t.fixas > 0 && <span className="ml-1 text-fs-2 text-fg-muted">({t.fixas === t.lancamentos ? "fixas" : `${t.fixas} ${t.fixas === 1 ? "fixa" : "fixas"}`})</span>}
                      </td>
                      <td className={TD_NUM}>{t.quantidade !== null ? num(t.quantidade) : "—"}</td>
                      <td className={TD_NUM}>{t.valor !== null ? brl(t.valor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        )}

        {mensal && etapa === "eventos" && !fechada && podeAgir && pessoasParaLancar.length > 0 && (
          <Secao titulo="Lançar por rubrica ou em grupo">
            <LancarPorRubrica acao={lancarPorRubricaAction} competenciaId={comp.id} rubricas={rubricasParaLancar} pessoas={pessoasParaLancar} />
          </Secao>
        )}

        {mensal && etapa === "eventos" && !fechada && podeAgir && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Secao titulo="Pedir os eventos ao cliente">
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

            <Secao titulo="Importar planilha ou Pontomais">
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
                : comparativos.length
                  ? `${divergentes} pessoa(s) diferem da Domínio em mais de 1 centavo.`
                  : undefined
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
                              {ajustesDe(c.personId).length > 0 && <Selo tom="marca">ajustado</Selo>}
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
              memoria={aberto.memoria as { inss?: string[]; irrf?: string[]; diasTrabalhados?: number; ajustes?: AjusteAplicado[] }}
              ajustes={ajustesDe(aberto.personId).map((a) => ({ id: a.id, campo: a.campo, valor: n(a.valor), valorCalculado: a.valorCalculado === null ? null : n(a.valorCalculado), motivo: a.motivo }))}
              podeAjustar={podeAgir && !fechada}
              competenciaId={comp.id}
              personId={aberto.personId}
              fgts={n(aberto.fgts)}
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

        {etapa === "conferir" && apuracao && (
          <Secao titulo="Apuração da competência" apoio="O que se recolhe no mês, com as retenções e compensações informadas abaixo.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-fs-3">
                <tbody>
                  <tr className={TR}>
                    <td className={TD}>INSS dos segurados</td>
                    <td className={TD_NUM}>{brl(apuracao.segurados)}</td>
                  </tr>
                  <tr className={TR}>
                    <td className={TD}>INSS da empresa (patronal) + RAT</td>
                    <td className={TD_NUM}>{brl(apuracao.patronal + apuracao.rat)}</td>
                  </tr>
                  <tr className={TR}>
                    <td className={TD}>(−) Salário-família, retenções e compensações de INSS</td>
                    <td className={TD_NUM}>{brl(-apuracao.deducoesUsadas)}</td>
                  </tr>
                  <tr className={TR}>
                    <td className={TD}>Terceiros (outras entidades)</td>
                    <td className={TD_NUM}>{brl(apuracao.terceiros)}</td>
                  </tr>
                  <tr className={`${TR} font-semibold`}>
                    <td className={TD}>INSS a recolher (DCTFWeb)</td>
                    <td className={TD_NUM}>{brl(apuracao.inssARecolher)}</td>
                  </tr>
                  <tr className={`${TR} font-semibold`}>
                    <td className={TD}>IRRF a recolher {apuracao.compensacoesIrrf > 0 && <span className="font-normal text-fg-muted">(retido {brl(apuracao.irrfRetido)} − compensações {brl(apuracao.compensacoesIrrf)})</span>}</td>
                    <td className={TD_NUM}>{brl(apuracao.irrfARecolher)}</td>
                  </tr>
                  {apuracao.pisSobreFolha && (
                    <tr className={`${TR} font-semibold`}>
                      <td className={TD}>
                        PIS sobre a folha a recolher <span className="font-normal text-fg-muted">(1% de {brl(apuracao.basePis)})</span>
                      </td>
                      <td className={TD_NUM}>{brl(apuracao.pisARecolher)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {(apuracao.saldoCp > 0 || apuracao.saldoIrrf > 0 || apuracao.saldoPis > 0) && (
              <Aviso tom="info" className="mt-3">
                Sobrou crédito para o mês seguinte ou restituição:
                {apuracao.saldoCp > 0 && ` INSS ${brl(apuracao.saldoCp)}.`}
                {apuracao.saldoIrrf > 0 && ` IRRF ${brl(apuracao.saldoIrrf)}.`}
                {apuracao.saldoPis > 0 && ` PIS ${brl(apuracao.saldoPis)}.`}
              </Aviso>
            )}
            <ul className="mt-3 space-y-0.5 text-fs-2 text-fg-muted">
              {apuracao.memoria.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>

            <h3 className="mt-6 mb-2 font-semibold text-fg text-fs-3">Retenções e compensações do mês</h3>
            {informacoes.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="w-full min-w-[640px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Tipo</th>
                      <th className={TH}>Tomador / origem</th>
                      <th className={TH_NUM}>Valor</th>
                      <th className={TH}>Observação</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {informacoes.map((i) => (
                      <tr key={i.id} className={TR}>
                        <td className={TD}>{ehTipoDeInformacao(i.tipo) ? TIPOS_DE_INFORMACAO[i.tipo].curto : i.tipo}</td>
                        <td className={`${TD} tabular-nums`}>
                          {i.documento ? `${i.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")} · ${i.referencia ?? ""}` : `Crédito de ${i.referencia ?? "—"}`}
                        </td>
                        <td className={TD_NUM}>{brl(n(i.valor))}</td>
                        <td className={`${TD} text-fg-muted`}>{i.observacao ?? ""}</td>
                        <td className={`${TD} text-right`}>
                          {podeAgir && !fechada && (
                            <FormularioDoDp2 acao={retirarInformacaoDaApuracaoAction} rotulo="Retirar" rotuloEnviando="Retirando…" variante="ghost" tamanho="xs">
                              <input type="hidden" name="informacaoId" value={i.id} />
                            </FormularioDoDp2>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {podeAgir && !fechada && (
              <FormularioDoDp2 acao={incluirInformacaoDaApuracaoAction} rotulo="Incluir" rotuloEnviando="Incluindo…" variante="secondary" icone={<Plus size={14} aria-hidden="true" />}>
                <input type="hidden" name="competenciaId" value={comp.id} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_1.2fr_1.2fr]">
                  <CampoForm label="Tipo" htmlFor="info-tipo">
                    <Select id="info-tipo" name="tipo" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {Object.entries(TIPOS_DE_INFORMACAO).map(([k, t]) => (
                        <option key={k} value={k}>
                          {t.nome}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Valor" htmlFor="info-valor">
                    <Input id="info-valor" name="valor" inputMode="decimal" prefix="R$" placeholder="0,00" required />
                  </CampoForm>
                  <CampoForm label="CNPJ do tomador (retenção)" htmlFor="info-documento">
                    <Input id="info-documento" name="documento" inputMode="numeric" placeholder="00.000.000/0000-00" />
                  </CampoForm>
                  <CampoForm label="Nº da nota (retenção) ou mês de origem (compensação)" htmlFor="info-referencia">
                    <Input id="info-referencia" name="referencia" maxLength={30} placeholder="NF 123 ou 2026-10" />
                  </CampoForm>
                  <CampoForm label="Observação" htmlFor="info-observacao" className="sm:col-span-2 lg:col-span-4">
                    <Input id="info-observacao" name="observacao" maxLength={300} />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            )}
          </Secao>
        )}

        {etapa === "fechar" && apuracao && (
          <Secao titulo="Guias da folha" apoio="O DARF da DCTFWeb (baixado pela rotina do Serpro) e a GFD do FGTS Digital, conferidos com a apuração da competência.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Guia</th>
                    <th className={TH_NUM}>Apurado</th>
                    <th className={TH_NUM}>Na guia</th>
                    <th className={TH_NUM}>Diferença</th>
                    <th className={TH}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {conferirGuias({
                    inssARecolher: apuracao.inssARecolher,
                    irrfARecolher: apuracao.irrfARecolher,
                    fgtsDoMes: calculos.reduce((s, c) => s + n(c.fgts), 0),
                    valorDarf: darfDoMes?.valor != null ? n(darfDoMes.valor) : null,
                    valorGfd: gfdDoMes?.valor != null ? n(gfdDoMes.valor) : null,
                  }).map((l) => {
                    const g = l.guia === "DCTFWEB" ? darfDoMes : gfdDoMes;
                    return (
                      <tr key={l.guia} className={TR}>
                        <td className={TD}>
                          {l.nome}
                          {g?.driveFileId && (
                            <a href={`/api/arquivos/${g.driveFileId}?ver=1`} target="_blank" rel="noreferrer" className="ml-2 text-fs-2 text-brand hover:underline">
                              PDF
                            </a>
                          )}
                          {g?.vencimento && <span className="block text-fs-2 text-fg-muted">Vence em {g.vencimento.split("-").reverse().join("/")}</span>}
                          <span className="block text-fs-2 text-fg-muted">{l.memoria}</span>
                          {l.guia === "DCTFWEB" && !darfDoMes && (
                            <span className="block text-fs-2 text-fg-muted">
                              {rotinaDctfweb ? `Rotina da DCTFWeb no Serpro: ${rotinaDctfweb.situacao.toLowerCase().replace(/_/g, " ")}.` : "A rotina da DCTFWeb ainda não trouxe o DARF deste mês."}
                            </span>
                          )}
                        </td>
                        <td className={TD_NUM}>{brl(l.esperado)}</td>
                        <td className={TD_NUM}>{l.valorDaGuia !== null ? brl(l.valorDaGuia) : "—"}</td>
                        <td className={`${TD_NUM} ${l.situacao === "DIFERE" ? "text-danger font-medium" : ""}`}>{l.diferenca !== null ? brl(l.diferenca) : "—"}</td>
                        <td className={TD}>
                          <Selo tom={l.situacao === "BATE" ? "sucesso" : l.situacao === "DIFERE" ? "perigo" : "neutro"}>{NOME_DA_SITUACAO_DA_GUIA[l.situacao]}</Selo>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {podeAgir && (
              <FormularioDoDp2 acao={anexarGfdAction} rotulo={gfdDoMes ? "Anexar outra GFD" : "Anexar a GFD"} rotuloEnviando="Anexando…" variante="secondary" className="mt-4">
                <input type="hidden" name="competenciaId" value={comp.id} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
                  <CampoForm label="PDF da GFD (FGTS Digital)" htmlFor="gfd-arquivo" dica="Baixe a guia no portal do FGTS Digital: ele não tem API para o Connect buscar.">
                    <input id="gfd-arquivo" name="arquivo" type="file" accept="application/pdf,.pdf" required className="text-fs-3" />
                  </CampoForm>
                  <CampoForm label="Valor total" htmlFor="gfd-valor">
                    <Input id="gfd-valor" name="valor" inputMode="decimal" prefix="R$" placeholder="0,00" required />
                  </CampoForm>
                  <CampoForm label="Vencimento" htmlFor="gfd-vencimento">
                    <CampoData id="gfd-vencimento" name="vencimento" required />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            )}
            <p className="mt-2 text-fs-2 text-fg-muted">O PIS sobre a folha, quando houver, sai em DARF à parte (código 8301), fora da DCTFWeb.</p>
          </Secao>
        )}

        {etapa === "conferir" && calculos.length > 0 && (mensal || comp.tipo === "DECIMO_2") && (
          <Secao
            titulo="Totalizadores do eSocial"
            apoio={
              conferenciaEsocial
                ? conferenciaEsocial.divergentes
                  ? `${conferenciaEsocial.divergentes} pessoa(s) com diferença entre o cálculo e o eSocial.`
                  : "O cálculo bate com o que o eSocial totalizou."
                : "Importe os XML de retorno do eSocial (S-5001, S-5002, S-5003, S-5011 e S-5013) para conferir com o cálculo."
            }
          >
            {podeAgir && (
              <FormularioDoDp2 acao={importarTotalizadoresAction} rotulo="Importar totalizadores" rotuloEnviando="Lendo…" variante="secondary" className="mb-4">
                <input type="hidden" name="competenciaId" value={comp.id} />
                <CampoForm label="XML de retorno ou .zip do eSocial" htmlFor="arquivo-totalizadores" dica="Do “eSocial Download” do portal ou do retorno da consulta do lote. Importar de novo troca os do mesmo tipo e CPF.">
                  <input id="arquivo-totalizadores" name="arquivo" type="file" multiple accept=".xml,.zip" required className="text-fs-3" />
                </CampoForm>
              </FormularioDoDp2>
            )}
            {conferenciaEsocial && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Colaborador</th>
                      <th className={TH_NUM}>INSS (S-5001)</th>
                      <th className={TH_NUM}>IRRF (S-5002)</th>
                      <th className={TH_NUM}>FGTS (S-5003)</th>
                      <th className={TH}>Conferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conferenciaEsocial.linhas.map((l) => (
                      <tr key={l.cpf ?? l.personId ?? l.nome} className={TR}>
                        <td className={TD}>
                          {l.nome}
                          {l.cpf && <span className="block text-fs-2 text-fg-muted">{formatCpf(l.cpf)}</span>}
                        </td>
                        <td className={TD_NUM}>
                          <CelulaDoTotalizador d={l.inss} />
                        </td>
                        <td className={TD_NUM}>
                          <CelulaDoTotalizador d={l.irrf} />
                        </td>
                        <td className={TD_NUM}>
                          <CelulaDoTotalizador d={l.fgts} />
                        </td>
                        <td className={TD}>
                          {l.diverge ? <Selo tom="perigo">difere do eSocial</Selo> : l.inss.esocial === null && l.irrf.esocial === null && l.fgts.esocial === null ? <span className="text-fg-muted">sem totalizador</span> : <Selo tom="sucesso">bate</Selo>}
                        </td>
                      </tr>
                    ))}
                    <tr className={`${TR} font-semibold`}>
                      <td className={TD}>Empresa (S-5011 e S-5013)</td>
                      <td className={TD_NUM}>
                        <CelulaDoTotalizador d={conferenciaEsocial.total.inss} />
                      </td>
                      <td className={TD_NUM}>
                        <CelulaDoTotalizador d={conferenciaEsocial.total.irrf} />
                      </td>
                      <td className={TD_NUM}>
                        <CelulaDoTotalizador d={conferenciaEsocial.total.fgts} />
                      </td>
                      <td className={TD} />
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-fs-2 text-fg-muted">Em cada célula: o valor do cálculo, o do eSocial e a diferença (cálculo − eSocial). INSS é o descontado do trabalhador; no total, o do S-5011.</p>
              </div>
            )}
          </Secao>
        )}

        {etapa === "fechar" && calculada && (
          <Secao
            titulo="Saídas da folha"
            apoio={fechada ? undefined : "Guardar nos Arquivos e gerar o arquivo do banco ficam liberados ao fechar a competência."}
          >
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <h3 className="text-fs-3 font-semibold text-fg">Holerites</h3>
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
                    {/* Só o gestor edita as rubricas (17/11/2026, bug-724): para o resto, o aviso diz a quem pedir. */}
                    {podeGerir ? (
                      <Link href="/dp2/rubricas" className="underline">
                        Configurar em Rubricas
                      </Link>
                    ) : (
                      "Peça ao gestor do setor para configurar as contas em Rubricas."
                    )}
                  </Aviso>
                )}
              </div>
            </div>
          </Secao>
        )}

        {etapa === "conferir" && (
          <Secao titulo="Comparar com a Domínio">
            {podeAgir ? (
              <FormularioDoDp2 acao={importarComparativoAction} rotulo="Comparar" rotuloEnviando="Lendo…" variante="secondary">
                <input type="hidden" name="competenciaId" value={comp.id} />
                {/* A ordem das colunas, que estava na linha de apoio, vai no
                    exemplo do campo (17/11/2026, melhoria-707). */}
                <Textarea name="texto" rows={4} placeholder={"CPF; proventos; descontos; líquido; INSS; IRRF; FGTS\n123.456.789-09; 3.243,89; 277,87; 2.966,02; 277,87; 0,00; 259,51"} aria-label="Valores da Domínio" />
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
  ajustes,
  podeAjustar,
  competenciaId,
  personId,
  fgts,
}: {
  nome: string;
  cpf: string | null;
  itens: ItemDoHolerite[];
  memoria: { inss?: string[]; irrf?: string[]; diasTrabalhados?: number; ajustes?: AjusteAplicado[] };
  ajustes: { id: string; campo: string; valor: number; valorCalculado: number | null; motivo: string }[];
  podeAjustar: boolean;
  competenciaId: string;
  personId: string;
  fgts: number;
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
  // As linhas, o FGTS e as provisões que o ajuste manual mudou (funcionalidade-768).
  const ajustados = new Set((memoria.ajustes ?? []).map((a) => a.campo));
  const opcoes = camposAjustaveis({ itens, fgts, provisoes });
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
                <td className={TD}>
                  {i.nome}
                  {ajustados.has(`ITEM:${i.codigo}`) && (
                    <Selo tom="marca" className="ml-2">
                      ajustado
                    </Selo>
                  )}
                </td>
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
          {ajustados.has("FGTS") && <p className="mt-1 text-brand">FGTS ajustado manualmente</p>}
          <h3 className="font-semibold text-fg mt-3 mb-1">Provisões do mês</h3>
          <ul className="text-fg-muted space-y-0.5">{provisoes.memoria.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-1">Total {brl(provisoes.total)}</p>
        </div>
      </div>

      {(ajustes.length > 0 || podeAjustar) && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-semibold text-fg text-fs-3 mb-2">Ajustes manuais</h3>
          {ajustes.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[640px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Valor ajustado</th>
                    <th className={TH_NUM}>Do motor</th>
                    <th className={TH_NUM}>Ajustado para</th>
                    <th className={TH}>Motivo</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {ajustes.map((a) => {
                    const aplicado = (memoria.ajustes ?? []).find((x) => x.campo === a.campo);
                    return (
                      <tr key={a.id} className={TR}>
                        <td className={TD}>
                          {aplicado?.nome ?? nomeDoCampo(a.campo, itens)}
                          {!aplicado && (
                            <Selo tom="atencao" className="ml-2">
                              não entrou
                            </Selo>
                          )}
                        </td>
                        <td className={TD_NUM}>{a.valorCalculado !== null ? brl(a.valorCalculado) : "—"}</td>
                        <td className={`${TD_NUM} font-medium`}>{brl(a.valor)}</td>
                        <td className={`${TD} text-fg-muted max-w-[42ch]`}>{a.motivo}</td>
                        <td className={`${TD} text-right`}>
                          {podeAjustar && (
                            <FormularioDoDp2 acao={retirarAjusteAction} rotulo="Retirar" rotuloEnviando="Retirando…" variante="ghost" tamanho="xs">
                              <input type="hidden" name="ajusteId" value={a.id} />
                            </FormularioDoDp2>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {podeAjustar && (
            <FormularioDoDp2 acao={ajustarCalculoAction} rotulo="Ajustar e recalcular" rotuloEnviando="Recalculando…" variante="secondary">
              <input type="hidden" name="competenciaId" value={competenciaId} />
              <input type="hidden" name="personId" value={personId} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_2fr]">
                <CampoForm label="Valor a ajustar" htmlFor="ajuste-campo">
                  <Select id="ajuste-campo" name="campo" required defaultValue="">
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {opcoes.map((o) => (
                      <option key={o.campo} value={o.campo}>
                        {o.nome} ({brl(o.valor)})
                      </option>
                    ))}
                  </Select>
                </CampoForm>
                <CampoForm label="Novo valor" htmlFor="ajuste-valor">
                  <Input id="ajuste-valor" name="valor" inputMode="decimal" prefix="R$" placeholder="0,00" required />
                </CampoForm>
                <CampoForm label="Motivo" htmlFor="ajuste-motivo">
                  <Input id="ajuste-motivo" name="motivo" maxLength={500} required placeholder="Ex.: valor conferido com a Domínio, acordo com o cliente" />
                </CampoForm>
              </div>
            </FormularioDoDp2>
          )}
        </div>
      )}

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

/** Cálculo, eSocial e a diferença numa célula (funcionalidade-755). */
function CelulaDoTotalizador({ d }: { d: Diferenca }) {
  if (d.esocial === null) return <span className="text-fg-muted">{brl(d.calculo)} · —</span>;
  const difere = d.diferenca !== null && Math.abs(d.diferenca) > 0.01;
  return (
    <span className="whitespace-nowrap">
      {brl(d.calculo)} · {brl(d.esocial)}
      {difere && <span className="block text-danger font-medium">{d.diferenca! > 0 ? "+" : ""}{brl(d.diferenca)}</span>}
    </span>
  );
}
