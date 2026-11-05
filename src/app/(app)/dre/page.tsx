import { notFound } from "next/navigation";
import { AlertTriangle, Eye, FileText, CalendarDays, CalendarRange, Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, type AuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PageContainer } from "@/components/shared/PageContainer";
import { EscolhaAEmpresa, FiltroDaEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { formatarCompetencia, formatarCompetenciaNumerica, formatarReaisDeCentavos as moeda } from "@/lib/format";
import { AvisoDeSemGrupo, PainelDeClassificacao } from "@/components/dre/PainelDeClassificacao";
import { dreDoMes, dreDoAnoDaEmpresa, mesesComMovimento } from "@/lib/dre/data";
import { dreDoAno } from "@/lib/dre/anual";
import { RelatorioAnual } from "@/components/dre/RelatorioAnual";
import { ImportarDoOmie } from "@/components/dre/ImportarDoOmie";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { TRANSFERENCIA, opcoesDaUrl, type ModeloDoDre } from "@/lib/dre/estrutura";
import { sufixoDosImpostos, trocaDosImpostos } from "@/lib/dre/visaoDosImpostos";
import { MenuDaDre } from "@/components/dre/MenuDaDre";
import { AbasDaDre } from "@/components/dre/AbasDaDre";
import { modeloDaEmpresa } from "@/lib/dre/modeloDaEmpresa";
import { desconsideradasDoPeriodo, excecoesDaEmpresa, itensDaFila, totalForaDasLinhas, type ItemDaFila } from "@/lib/dre/fila";
import { podeAbrirADre, podeTrocarOModeloDoDre } from "@/lib/dre/acesso";
import { getEnabledModuleCodes, isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { DreDoCliente } from "@/components/dre/DreDoCliente";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";

/**
 * O mês do DRE no formato de competência do app, "Out/26" (08/10/2026). Era
 * "Outubro/2026" só aqui, enquanto a DRE econômica, as análises e o fluxo
 * diziam "Out/26".
 */
function rotuloDoMes(m: { ano: number; mes: number }): string {
  return formatarCompetencia(competenciaDe(m.ano, m.mes));
}

/**
 * O mês no filtro, em número: "10/2026" (pedido do Kauan, 14/10/2026), como
 * nas outras telas da família da DRE. Só no filtro — o subtítulo, a
 * comparação com o mês anterior e a nota do pé seguem com `rotuloDoMes`.
 */
function rotuloDoMesNoFiltro(m: { ano: number; mes: number }): string {
  return formatarCompetenciaNumerica(competenciaDe(m.ano, m.mes));
}

// O gate — setor que opera o módulo e módulo ligado — mora em `podeAbrirADre`,
// a mesma régua da rota que exporta no modelo do BPO (13/10/2026).
export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; mes?: string; visao?: string; ano?: string; impostos?: string; como?: string; regime?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!(await podeAbrirADre(ctx))) notFound();

  const { empresa, mes, visao, ano, impostos, como, regime } = await searchParams;
  const prisma = getPrisma();

  const empresas = await prisma.company.findMany({
    // Só cliente ativo: DRE de prospect ou de empresa encerrada não é
    // relatório, é ruído no seletor.
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, tradeName: true, logoUrl: true, cnpj: true, parentCompanyId: true },
  });

  // A empresa da URL, a última aberta pela pessoa — ou nenhuma, e a tela pede
  // (13/10/2026). Era a primeira em ordem alfabética, e a classificação e o
  // "Importar do Omie" gravavam nela sem ninguém ter escolhido.
  // Com uma empresa em foco (21/10/2026), só ela, a matriz e as filiais.
  const { escolha, empresa: daTela, foco } = await escolherEmpresaDaTela(ctx, empresa, empresas, { comFoco: true });
  const companyId = daTela?.id ?? null;
  if (!daTela || !companyId) {
    return (
      <PageContainer>
        <PageHeader title="DRE" subtitle="Demonstrativo de resultado, por empresa e mês." />
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa cadastrada" icon={<FileText />} />
        ) : (
          <>
            <div className="mb-4">
              <FiltroDaEmpresa className="" foco={foco} />
            </div>
            <EscolhaAEmpresa escolha={escolha} porQue="A DRE é de uma empresa por vez." />
          </>
        )}
      </PageContainer>
    );
  }
  // Todo formulário desta tela grava na empresa escolhida — o rodapé diz qual.
  const comEmpresa = (tela: React.ReactNode) => (
    <EmpresaDaTela empresa={{ nome: daTela.tradeName || daTela.name, cnpj: daTela.cnpj }}>{tela}</EmpresaDaTela>
  );

  // O modelo do DRE da empresa (21/10/2026) e, no padrão, as duas visões dos
  // impostos (20/10/2026): no EBITDA, o padrão; ou fora do resultado.
  const [meses, modelo, podeTrocarModelo] = await Promise.all([
    mesesComMovimento(ctx.tenantId, companyId),
    modeloDaEmpresa(ctx.tenantId, companyId),
    podeTrocarOModeloDoDre(ctx),
  ]);
  const opcoes = opcoesDaUrl(impostos, modelo);

  // O topo (05/11/2026, escolha 5A do Kauan): uma ação principal, "Importar do
  // Omie", e o "⋯" com exportar, modelo e impostos; embaixo, as quatro DREs em
  // abas e, na de caixa, "DRE da equipe" | "Como o cliente vê". Eram três
  // botões no cabeçalho e cinco controles na fileira dos filtros.
  const topo = ({
    subtitulo,
    exportar,
    impostosDaTela,
    competencia,
    visao,
    equipe,
    cliente,
  }: {
    subtitulo: string;
    exportar: string;
    /** Os parâmetros da tela, para a troca dos impostos; `null` onde ela não vale (a visão do cliente). */
    impostosDaTela: Record<string, string | undefined> | null;
    /** O mês da tela, "AAAA-MM", que as abas das outras DREs levam. */
    competencia: string | null;
    visao: "equipe" | "cliente";
    equipe: string;
    cliente: string;
  }) => (
    <>
      <PageHeader
        title="DRE"
        subtitle={subtitulo}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportarDoOmie companyId={companyId} />
            <MenuDaDre
              companyId={companyId}
              exportar={exportar}
              modelo={{ codigo: modelo.codigo, nome: modelo.nome }}
              podeTrocarModelo={podeTrocarModelo}
              impostos={impostosDaTela && modelo.impostos === "escolha" ? trocaDosImpostos(opcoes, "/dre", impostosDaTela) : null}
            />
          </div>
        }
      />
      <AbasDaDre ativa="caixa" companyId={companyId} mes={competencia} />
      {/* "Ver como o cliente" vira aba (05/11/2026): era um botão no topo que
          trocava a tela inteira e voltava por outro botão. */}
      <AbasDeLink
        aria-label="De quem é a visão"
        ativa={visao}
        abas={[
          { chave: "equipe", rotulo: "DRE da equipe", href: equipe, icone: <Users /> },
          { chave: "cliente", rotulo: "Como o cliente vê", href: cliente, icone: <Eye /> },
        ]}
      />
    </>
  );

  // "Ver como o cliente" (21/10/2026): a tela do portal desta empresa, só de
  // leitura, com o mesmo componente — sem fila, sem seletor dos impostos.
  // `mes` e `ano` aqui seguem o formato do portal ("2026-09", "2026").
  if (como === "cliente") {
    const doPortal = mes?.match(/^(\d{4})-(\d{2})$/);
    const anoDoPortal = ano && /^\d{4}$/.test(ano) ? ano : null;
    // Volta para o mesmo período, no formato da tela da equipe ("2026-9").
    const daEquipe = anoDoPortal
      ? `/dre?empresa=${companyId}&visao=ano&ano=${anoDoPortal}`
      : `/dre?empresa=${companyId}${doPortal ? `&mes=${doPortal[1]}-${Number(doPortal[2])}` : ""}`;
    const mesDaExportacao = anoDoPortal
      ? null
      : doPortal
        ? `${doPortal[1]}-${Number(doPortal[2])}`
        : meses[0]
          ? `${meses[0].ano}-${meses[0].mes}`
          : null;
    const exportar = anoDoPortal
      ? `/dre/exportar?empresa=${companyId}&visao=ano&ano=${anoDoPortal}`
      : `/dre/exportar?empresa=${companyId}&visao=mes${mesDaExportacao ? `&mes=${mesDaExportacao}` : ""}`;
    const noPortal = new URLSearchParams({ empresa: companyId, como: "cliente" });
    if (mes) noPortal.set("mes", mes);
    if (ano) noPortal.set("ano", ano);
    return comEmpresa(
      <PageContainer>
        {topo({
          subtitulo: "A DRE desta empresa exatamente como aparece no portal do cliente. Só leitura.",
          exportar,
          impostosDaTela: null,
          competencia: doPortal ? mes! : null,
          visao: "cliente",
          equipe: daEquipe,
          cliente: `/dre?${noPortal.toString()}`,
        })}
        <FiltroDaEmpresa className="" foco={foco} />
        <ComoOClienteVe tenantId={ctx.tenantId} companyId={companyId} params={{ mes, ano, regime }} />
      </PageContainer>
    );
  }

  // ─── Visão de doze meses ─────────────────────────────────────────────────
  if (visao === "ano") {
    const anoEscolhido = Number(ano) || meses[0]?.ano || new Date().getFullYear();
    const anos = [...new Set(meses.map((m) => m.ano))].sort((a, b) => b - a);
    const {
      meses: porMes,
      categorias: categoriasDoAno,
      naoClassificado: soltosDoAno,
      desconsiderado: desconsideradoDoAno,
      fontesDoSemCategoria,
      temMesImportado,
      impostoForaDoResultado: impostoDoAno,
    } = await dreDoAnoDaEmpresa(ctx.tenantId, companyId, anoEscolhido, opcoes);
    const anual = dreDoAno(porMes, opcoes);

    // O ano mistura meses importados e meses do financeiro.
    const fila = itensDaFila(soltosDoAno, categoriasDoAno, { temImport: temMesImportado, doSemCategoria: fontesDoSemCategoria });

    return comEmpresa(
      <PageContainer>
        <PainelDeClassificacao
          companyId={companyId}
          modelo={modelo.codigo}
          itens={fila}
          contas={await linksDasContas(ctx, companyId, fila)}
          excecoes={excecoesDaEmpresa(categoriasDoAno)}
          desconsideradas={desconsideradasDoPeriodo(desconsideradoDoAno, categoriasDoAno)}
        >
          {topo({
            subtitulo: "Demonstrativo de resultado de caixa — os doze meses lado a lado.",
            exportar: `/dre/exportar?empresa=${companyId}&visao=ano&ano=${anoEscolhido}${sufixoDosImpostos(opcoes)}`,
            impostosDaTela: { empresa: companyId, visao: "ano", ano: String(anoEscolhido) },
            competencia: null,
            visao: "equipe",
            equipe: `/dre?empresa=${companyId}&visao=ano&ano=${anoEscolhido}${sufixoDosImpostos(opcoes)}`,
            cliente: `/dre?empresa=${companyId}&como=cliente&ano=${anoEscolhido}`,
          })}
          <FiltroDaEmpresa className="" foco={foco} />
          {/* Por mês | Ano inteiro num seletor, e o ano no "Filtros" — sem uma
              terceira fileira de abas embaixo das de cima. */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <SeletorDaVisao companyId={companyId} ativa="ano" ano={anoEscolhido} sufixo={sufixoDosImpostos(opcoes)} />
            <FiltrosDaTela
              campos={[{ chave: "ano", rotulo: "Ano", vazioLabel: `Mais recente (${anos[0] ?? anoEscolhido})`, sempreVisivel: true, opcoes: anos.map((a) => ({ value: String(a), label: String(a) })) }]}
            />
          </div>
          {/* Os dois avisos que só a visão mensal tinha. Uma categoria que
              some R$ 200 por mês some R$ 2.400 no ano — e doze avisos pequenos
              passam onde um grande não passaria. */}
          {impostoDoAno !== 0 && (
            // O `Aviso` do app (08/10/2026), com o texto em `fg`: o parágrafo é
            // longo, e o âmbar como cor de texto fica abaixo do contraste AA.
            <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
              <span className="text-fg">
                <strong>{moeda(Math.abs(impostoDoAno))}</strong> de impostos sobre a receita saíram
                do caixa em {anoEscolhido} e <strong>não entram</strong> no resultado abaixo — <PorQueOImpostoFicaFora modelo={modelo} />
              </span>
            </Aviso>
          )}
          <AvisoDeSemGrupo />

          <RelatorioAnual anual={anual} />
          <NotaDeFonte>
            {/* A média divide pelos meses com movimento, como o AVERAGE do Excel:
                dividir por doze em setembro diz que a empresa faturou 25% menos. */}
            A coluna <strong>Média</strong> divide por {anual.mesesComMovimento}{" "}
            {anual.mesesComMovimento === 1 ? "mês com movimento" : "meses com movimento"}, não por doze.
            Os percentuais do ano saem dos valores somados, não da média dos percentuais mensais.
            {desconsideradoDoAno.length > 0 &&
              ` · ${moeda(totalForaDasLinhas(desconsideradoDoAno))} desconsiderados no ano, fora do DRE`}
          </NotaDeFonte>
        </PainelDeClassificacao>
      </PageContainer>
    );
  }

  const escolhido = (mes && meses.find((m) => `${m.ano}-${m.mes}` === mes)) ?? meses[0] ?? null;

  if (!escolhido) {
    return comEmpresa(
      <PageContainer>
        {/* "Importar do Omie" no cabeçalho, como nas telas com movimento: é
            aqui que quem ainda monta o DRE fora do Connect começa. */}
        <PageHeader
          title="DRE"
          subtitle="Demonstrativo de resultado, por empresa e mês."
          action={<ImportarDoOmie companyId={companyId} />}
        />
        <AbasDaDre ativa="caixa" companyId={companyId} />
        <FiltroDaEmpresa className="" foco={foco} />
        {/* Em cartão, como o vazio das listas (08/10/2026): solto, flutuava no fundo. */}
        <Card className="mt-4">
          <EmptyState
            title="Nenhum pagamento ou recebimento nesta empresa"
            description="O DRE é de caixa: ele monta a partir do que foi efetivamente pago e recebido, não do que foi lançado. Quem ainda monta o DRE no Omie pode começar por “Importar do Omie”, no topo."
            icon={<FileText />}
          />
        </Card>
      </PageContainer>
    );
  }

  // O mês anterior só entra na comparação quando teve movimento (pago,
  // recebido ou importado): sem ele, "subiu 100%" sobre zero diria nada.
  const anteriorAoEscolhido = escolhido.mes === 1 ? { ano: escolhido.ano - 1, mes: 12 } : { ano: escolhido.ano, mes: escolhido.mes - 1 };
  const temAnterior = meses.some((m) => m.ano === anteriorAoEscolhido.ano && m.mes === anteriorAoEscolhido.mes);
  const [{ resultado, categorias, lancamentos, fonte }, anterior] = await Promise.all([
    dreDoMes(ctx.tenantId, companyId, escolhido, opcoes),
    temAnterior ? dreDoMes(ctx.tenantId, companyId, anteriorAoEscolhido, opcoes) : Promise.resolve(null),
  ]);

  const fila = itensDaFila(resultado.naoClassificado, categorias, {
    temImport: fonte.tipo === "import",
    doSemCategoria: [fonte.tipo],
  });

  const impostoDeFora = impostoForaDoResultado(resultado, opcoes);
  const transferencias = resultado.porGrupo[TRANSFERENCIA] ?? 0;

  return comEmpresa(
    <PageContainer>
      <PainelDeClassificacao
        companyId={companyId}
        modelo={modelo.codigo}
        itens={fila}
        contas={await linksDasContas(ctx, companyId, fila)}
        excecoes={excecoesDaEmpresa(categorias)}
        desconsideradas={desconsideradasDoPeriodo(resultado.desconsiderado, categorias)}
      >
        {/* O mês escrito na tela (07/10, auditoria dos gráficos): ficava só
            dentro do botão Filtros ("Mais recente (…)"), e a tabela inteira
            aparecia sem dizer de quando. */}
        {topo({
          subtitulo: `Demonstrativo de resultado de caixa de ${rotuloDoMes(escolhido)} — monta do que foi pago e recebido no mês.`,
          exportar: `/dre/exportar?empresa=${companyId}&visao=mes&mes=${escolhido.ano}-${escolhido.mes}${sufixoDosImpostos(opcoes)}`,
          impostosDaTela: { empresa: companyId, mes },
          competencia: competenciaDe(escolhido.ano, escolhido.mes),
          visao: "equipe",
          equipe: `/dre?empresa=${companyId}${mes ? `&mes=${mes}` : ""}${sufixoDosImpostos(opcoes)}`,
          cliente: `/dre?empresa=${companyId}&como=cliente&mes=${competenciaDe(escolhido.ano, escolhido.mes)}`,
        })}
        <FiltroDaEmpresa className="" foco={foco} />

        {/* As abas, depois a visão e o mês, os números do topo e a tabela — a
            ordem das quatro DREs (05/11/2026). O mês numa lista com busca, e
            não 18 pílulas numa fileira — a regra da conferência de 30/09 para
            competência. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <SeletorDaVisao companyId={companyId} ativa="mes" ano={escolhido.ano} sufixo={sufixoDosImpostos(opcoes)} />
          <FiltrosDaTela
            campos={[
              {
                chave: "mes",
                rotulo: "Mês",
                vazioLabel: meses[0] ? `Mais recente (${rotuloDoMesNoFiltro(meses[0])})` : "Mais recente",
                sempreVisivel: true,
                opcoes: meses.map((m) => ({ value: `${m.ano}-${m.mes}`, label: rotuloDoMesNoFiltro(m) })),
              },
            ]}
          />
        </div>

        {/* Os números do topo, como na DRE econômica (08/10/2026, escolha 9A do
            Kauan: na DRE, o padrão entra nos números do topo e a tabela fica
            como está). A tela de caixa abria direto nas 30 linhas da tabela. */}
        <NumerosDaDre
          resultado={resultado}
          regime="caixa"
          anterior={anterior ? { resultado: anterior.resultado, rotulo: rotuloDoMes(anteriorAoEscolhido) } : null}
          className="mb-4"
        />

        {/* Quando os impostos ficam fora do resultado — no modelo por área, ou
            na visão "Impostos fora do resultado" do padrão —, quanto ficou de
            fora: um número que muda o resultado precisa aparecer na tela. */}
        {impostoDeFora !== 0 && (
          // O `Aviso` do app (08/10/2026), com o texto em `fg`: o parágrafo é
          // longo, e o âmbar como cor de texto fica abaixo do contraste AA.
          <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
            <span className="text-fg">
              <strong>{moeda(Math.abs(impostoDeFora))}</strong> de impostos sobre a receita saíram do
              caixa e <strong>não entram</strong> no resultado abaixo — <PorQueOImpostoFicaFora modelo={modelo} />
            </span>
          </Aviso>
        )}

        {/* O que falta classificar, em uma linha que abre o painel — a fila
            inteira aqui fazia rolar (13/10/2026). */}
        <AvisoDeSemGrupo />

        {/* De onde saiu o número. Relatório que muda de fonte sem avisar é
            relatório em que ninguém confia duas vezes. Na `NotaDeFonte` (15/10/2026),
            como as outras notas da tela; o `mt-3` dela some na margem do bloco de cima. */}
        <NotaDeFonte className="mb-3">
          {fonte.tipo === "import"
            ? `Montado do arquivo importado do Omie${fonte.arquivos.length > 0 ? ` (${[...new Set(fonte.arquivos)].join(", ")})` : ""}.`
            : "Montado dos lançamentos pagos e recebidos no Connect."}
        </NotaDeFonte>

        {/* A categoria aberta muda de linha só nesta empresa (28/10/2026, pedido do BPO). */}
        <RelatorioDoDre resultado={resultado} mover={{ companyId, modelo: modelo.codigo }} />

        <NotaDeFonte>
          {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} pagos ou recebidos em{" "}
          {rotuloDoMes(escolhido)}
          {transferencias !== 0 &&
            ` · ${moeda(transferencias)} em transferências entre contas, fora do DRE`}
          {/* O desconsiderado tem o resumo dele no painel de classificação;
              aqui só o número, como a transferência. */}
          {resultado.desconsiderado.length > 0 &&
            ` · ${moeda(totalForaDasLinhas(resultado.desconsiderado))} desconsiderados, fora do DRE`}
          {/* Diferente de zero significa que algo entrou e não foi somado em lugar
              nenhum. É a conferência que a planilha faz à mão, nas abas Check. */}
          {resultado.diferencaDeFechamento !== 0 && (
            <span className="text-danger">
              {" "}· atenção: {moeda(resultado.diferencaDeFechamento)} não fecharam
            </span>
          )}
        </NotaDeFonte>
      </PainelDeClassificacao>
    </PageContainer>
  );
}

/**
 * O porquê do imposto fora do resultado, conforme o modelo: no por área é a
 * regra do modelo; no padrão, a visão escolhida no "⋯" do topo.
 */
function PorQueOImpostoFicaFora({ modelo }: { modelo: ModeloDoDre }) {
  if (modelo.impostos === "fora") {
    return <>a margem de contribuição parte da Receita Bruta, como na planilha do modelo “{modelo.nome}”.</>;
  }
  return (
    <>
      é a visão “Impostos fora do resultado”.
      <span className="block text-fs-2 text-fg-secondary mt-1">
        Em “Impostos no EBITDA”, o padrão, eles descontam do EBITDA e do resultado. É o padrão que o cliente vê no
        portal (21/10/2026).
      </span>
    </>
  );
}

/**
 * A aba "Como o cliente vê" (21/10/2026; aba desde 05/11/2026): o corpo de
 * `/portal/dre` desta empresa, com as mesmas regras do portal — a aba
 * Competência só com a DRE econômica ligada, e o aviso quando o escritório
 * bloqueou a tela para os clientes.
 *
 * Numa moldura com o nome "Prévia do portal": o portal tem as próprias abas
 * (Caixa | Competência) e o próprio filtro, e solto embaixo das abas da tela
 * ele parecia mais uma fileira de navegação da equipe.
 */
async function ComoOClienteVe({
  tenantId,
  companyId,
  params,
}: {
  tenantId: string;
  companyId: string;
  params: { mes?: string; ano?: string; regime?: string };
}) {
  const [modulos, bloqueada] = await Promise.all([getEnabledModuleCodes(tenantId), telaBloqueadaNoPortal(tenantId, "/portal/dre")]);
  return (
    <>
      {bloqueada && (
        <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
          <span className="text-fg">
            Hoje o cliente <strong>não vê</strong> esta tela: a DRE está bloqueada no portal. Abaixo, o que ele veria se ela
            fosse liberada.
          </span>
        </Aviso>
      )}
      <section aria-labelledby="previa-do-portal" className="rounded-lg border border-border p-3 sm:p-4">
        <p id="previa-do-portal" className="flex items-center gap-1.5 text-fs-2 text-fg-muted mb-3">
          <Eye size={14} aria-hidden /> Prévia do portal do cliente — só leitura
        </p>
        <DreDoCliente
          tenantId={tenantId}
          companyId={companyId}
          params={params}
          competenciaLiberada={modulos.has("dre_economica")}
          acao="/dre"
          manter={{ como: "cliente" }}
        />
      </section>
    </>
  );
}

/**
 * "Por mês" e "Ano inteiro" trocam a visão do relatório. Eram abas embaixo da
 * fileira dos filtros; com as quatro DREs e a visão do cliente em abas no
 * alto (05/11/2026, escolha 5A do Kauan), viram um seletor na fileira, ao lado
 * do mês — a terceira fileira de abas não cabia.
 */
function SeletorDaVisao({ companyId, ativa, ano, sufixo }: { companyId: string; ativa: "mes" | "ano"; ano: number; sufixo: string }) {
  return (
    <SegmentedControl
      label="Período do relatório"
      active={ativa}
      items={[
        { key: "mes", label: "Por mês", href: `/dre?empresa=${companyId}${sufixo}`, icon: <CalendarDays size={14} aria-hidden /> },
        { key: "ano", label: "Ano inteiro", href: `/dre?empresa=${companyId}&visao=ano&ano=${ano}${sufixo}`, icon: <CalendarRange size={14} aria-hidden /> },
      ]}
    />
  );
}

type LinksDasContas = { pagamento: string | null; recebimento: string | null };

/**
 * O link "Ver as contas" do lançamento sem categoria do financeiro, com o
 * mesmo gate de `ContasPage` (setor do módulo e módulo ligado) — link para uma
 * tela que responde 404 é pior que nenhum. Só consulta quando a fila tem esse
 * caso.
 */
async function linksDasContas(ctx: AuthContext, companyId: string, fila: ItemDaFila[]): Promise<LinksDasContas> {
  const precisa = fila.some((i) => i.acao.tipo === "sem-categoria" && i.acao.fontes.includes("financeiro"));
  if (!precisa || !ctx.tenantId) return { pagamento: null, recebimento: null };
  const pode = async (modulo: string) => {
    const setor = await setoresDoModulo(ctx.tenantId, modulo);
    return !!setor && canActOnSector(ctx, setor) && (await isModuleEnabled(ctx.tenantId, modulo));
  };
  const [pagar, receber] = await Promise.all([pode("bpo_contas_pagar"), pode("bpo_contas_receber")]);
  return {
    pagamento: pagar ? `/pagar?empresa=${companyId}` : null,
    recebimento: receber ? `/receber?empresa=${companyId}` : null,
  };
}

