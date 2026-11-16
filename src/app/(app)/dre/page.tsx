import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, FilePen, FileText, CalendarDays, CalendarRange } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, type AuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PageContainer } from "@/components/shared/PageContainer";
import { EscolhaAEmpresa, FiltroDaEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { formatarCompetencia, formatarCompetenciaNumerica, formatarReaisDeCentavos as moeda, formatInstantDate } from "@/lib/format";
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
import { podeAbrirADre, podeTrocarOModeloDoDre, podeVerComoOCliente } from "@/lib/dre/acesso";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { ComoOClienteVe } from "@/components/dre/ComoOClienteVe";
import { ControleDaVisao } from "@/components/dre/ControleDaVisao";
import { enderecoNovoDaVisaoDoCliente, hrefDaVisaoDaEquipe, hrefDaVisaoDoCliente, periodoDoPortal } from "@/lib/dre/visaoDaDre";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { FaixaDoRascunho } from "@/components/dre/FaixaDoRascunho";
import { diferencasDaDre } from "@/lib/dre/publicacao";
import type { Publicacao } from "@/lib/dre/doClientePublicado";
import { fotoAtualDoMes, garantirFotoInicial, mesesComRascunho, publicacoesDaEmpresa } from "@/lib/dre/publicacaoServidor";

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
  // A competência do cliente era uma aba dentro da visão do cliente, nesta
  // rota (`regime=competencia`). Agora é a aba Competência de cima: o endereço
  // antigo segue valendo, levado para lá (16/11/2026, melhoria-718).
  if (como === "cliente" && regime === "competencia") {
    const novo = enderecoNovoDaVisaoDoCliente({ como, regime, empresa, mes, ano }, await podeVerComoOCliente(ctx, "competencia"));
    if (novo) redirect(novo);
  }
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
  // A foto inicial da empresa (05/11/2026, ver `publicacaoServidor.ts`): na
  // primeira abertura depois do deploy da publicação, o que o cliente já via
  // vira a versão publicada de cada mês.
  const [meses, modelo, podeTrocarModelo] = await Promise.all([
    mesesComMovimento(ctx.tenantId, companyId),
    modeloDaEmpresa(ctx.tenantId, companyId),
    podeTrocarOModeloDoDre(ctx),
    garantirFotoInicial(ctx.tenantId, companyId),
  ]);
  const opcoes = opcoesDaUrl(impostos, modelo);

  // O topo (05/11/2026, escolha 5A do Kauan): uma ação principal, "Importar do
  // Omie", e o "⋯" com exportar, modelo e impostos; embaixo, as quatro DREs em
  // abas. Eram três botões no cabeçalho e cinco controles na fileira dos
  // filtros. "DRE da equipe" | "Como o cliente vê" eram uma segunda fileira de
  // abas aqui; desde 16/11/2026 (melhoria-718) são o seletor "Visão", na
  // fileira dos filtros (`ControleDaVisao`).
  const topo = ({
    subtitulo,
    exportar,
    impostosDaTela,
    competencia,
    visaoDoCliente,
  }: {
    subtitulo: string;
    exportar: string;
    /** Os parâmetros da tela, para a troca dos impostos; `null` onde ela não vale (a visão do cliente). */
    impostosDaTela: Record<string, string | undefined> | null;
    /** O mês da tela, "AAAA-MM", que as abas das outras DREs levam. */
    competencia: string | null;
    /** A tela está na visão do cliente: as abas Caixa e Competência seguem nela. */
    visaoDoCliente?: { ano: string | null };
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
      <AbasDaDre ativa="caixa" companyId={companyId} mes={competencia} visaoDoCliente={visaoDoCliente} />
    </>
  );

  // "Visão: Cliente" (21/10/2026, "Ver como o cliente"): a tela do portal desta
  // empresa, só de leitura, com o mesmo componente — sem fila, sem seletor dos
  // impostos. `mes` e `ano` aqui seguem o formato do portal ("2026-09", "2026").
  if (como === "cliente") {
    const periodo = periodoDoPortal(mes, ano);
    const [anoDoMes, numeroDoMes] = periodo.mes?.split("-") ?? [];
    const mesDaExportacao = periodo.ano
      ? null
      : periodo.mes
        ? `${anoDoMes}-${Number(numeroDoMes)}`
        : meses[0]
          ? `${meses[0].ano}-${meses[0].mes}`
          : null;
    const exportar = periodo.ano
      ? `/dre/exportar?empresa=${companyId}&visao=ano&ano=${periodo.ano}`
      : `/dre/exportar?empresa=${companyId}&visao=mes${mesDaExportacao ? `&mes=${mesDaExportacao}` : ""}`;
    return comEmpresa(
      <PageContainer>
        {/* O subtítulo dizia "como aparece no portal do cliente. Só leitura.";
            quem diz isso agora é o selo ao lado de "Visão" (16/11/2026). */}
        {topo({
          subtitulo: "Demonstrativo de resultado, por empresa e mês.",
          exportar,
          impostosDaTela: null,
          competencia: periodo.mes,
          visaoDoCliente: { ano: periodo.ano },
        })}
        <FiltroDaEmpresa className="" foco={foco} />
        <ComoOClienteVe
          tenantId={ctx.tenantId}
          companyId={companyId}
          regime="caixa"
          params={{ mes, ano }}
          naFileira={
            <ControleDaVisao
              ativa="cliente"
              // Volta para o mesmo período, no formato da tela da equipe ("2026-9").
              equipe={hrefDaVisaoDaEquipe("caixa", companyId, periodo)}
              cliente={hrefDaVisaoDoCliente("caixa", companyId, periodo)}
            />
          }
        />
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
    const comRascunho = await mesesComRascunho(ctx.tenantId, companyId, anoEscolhido, porMes, modelo);

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
          })}
          <FiltroDaEmpresa className="" foco={foco} />
          {/* "Visão", Por mês | Ano inteiro e o ano no "Filtros", numa fileira
              só — sem outra fileira de abas embaixo das de cima. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
            <ControleDaVisao
              ativa="equipe"
              equipe={`/dre?empresa=${companyId}&visao=ano&ano=${anoEscolhido}${sufixoDosImpostos(opcoes)}`}
              cliente={hrefDaVisaoDoCliente("caixa", companyId, { ano: String(anoEscolhido) })}
            />
            <SeletorDaVisao companyId={companyId} ativa="ano" ano={anoEscolhido} sufixo={sufixoDosImpostos(opcoes)} />
            <FiltrosDaTela
              campos={[{ chave: "ano", rotulo: "Ano", vazioLabel: `Mais recente (${anos[0] ?? anoEscolhido})`, sempreVisivel: true, opcoes: anos.map((a) => ({ value: String(a), label: String(a) })) }]}
            />
          </div>
          <RascunhoDoAno companyId={companyId} ano={anoEscolhido} meses={comRascunho} />
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
  const competencia = competenciaDe(escolhido.ano, escolhido.mes);
  const [{ resultado, categorias, lancamentos, fonte }, anterior, fotoAtual, publicadas] = await Promise.all([
    dreDoMes(ctx.tenantId, companyId, escolhido, opcoes),
    temAnterior ? dreDoMes(ctx.tenantId, companyId, anteriorAoEscolhido, opcoes) : Promise.resolve(null),
    // O rascunho (05/11/2026, decisão D4 do Kauan): a DRE de agora, como o
    // cliente a veria, contra a versão publicada no portal.
    fotoAtualDoMes(ctx.tenantId, companyId, competencia),
    publicacoesDaEmpresa(ctx.tenantId, companyId, [competencia]),
  ]);
  const publicada = publicadas.get(competencia) ?? null;
  const diferencas = diferencasDaDre(publicada?.foto ?? null, fotoAtual);

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
          competencia,
        })}
        <FiltroDaEmpresa className="" foco={foco} />

        {/* As abas, depois a visão e o mês, os números do topo e a tabela — a
            ordem das quatro DREs (05/11/2026). O mês numa lista com busca, e
            não 18 pílulas numa fileira — a regra da conferência de 30/09 para
            competência. "Visão: Equipe | Cliente" vem primeiro na fileira
            (16/11/2026, melhoria-718): era uma segunda fileira de abas. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
          <ControleDaVisao
            ativa="equipe"
            equipe={`/dre?empresa=${companyId}${mes ? `&mes=${mes}` : ""}${sufixoDosImpostos(opcoes)}`}
            cliente={hrefDaVisaoDoCliente("caixa", companyId, { mes: competencia })}
          />
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
          {publicada && diferencas.length === 0 && <VersaoNoPortal publicada={publicada} />}
        </div>

        {/* O rascunho e o que falta classificar, logo abaixo da fileira — os
            dois dizem o que ainda não está pronto para o cliente. */}
        {diferencas.length > 0 && (
          <FaixaDoRascunho
            companyId={companyId}
            competencia={competencia}
            rotuloDoMes={rotuloDoMes(escolhido)}
            diferencas={diferencas}
            nuncaPublicado={!publicada}
          />
        )}
        <AvisoDeSemGrupo />

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
 * A versão que o portal mostra, na ponta da fileira, quando a DRE da equipe
 * está igual a ela — o par da faixa do rascunho.
 */
function VersaoNoPortal({ publicada }: { publicada: Publicacao }) {
  const quando = formatInstantDate(publicada.publicadoEm);
  return (
    <p className="text-fs-2 text-fg-muted sm:ml-auto">
      No portal: versão de {quando}
      {publicada.inicial ? " (a que o cliente já via)" : publicada.publicadoPorNome ? `, publicada por ${publicada.publicadoPorNome}` : ""}
    </p>
  );
}

/**
 * Na visão do ano, os meses com mudança fora do portal. A publicação é por
 * mês, então cada um leva ao mês, onde ficam "Ver diferenças" e "Publicar".
 */
function RascunhoDoAno({ companyId, ano, meses }: { companyId: string; ano: number; meses: string[] }) {
  if (meses.length === 0) return null;
  return (
    <Aviso tom="marca" icone={<FilePen />} className="mb-4">
      <p className="text-fg">
        <strong>Rascunho em {ano}</strong> —{" "}
        {meses.length === 1 ? "um mês tem mudanças que ainda não estão" : `${meses.length} meses têm mudanças que ainda não estão`} no
        portal:{" "}
        {meses.map((c, i) => {
          const [a, m] = c.split("-");
          return (
            <span key={c}>
              {i > 0 && (i === meses.length - 1 ? " e " : ", ")}
              <Link href={`/dre?empresa=${companyId}&mes=${a}-${Number(m)}`} className="font-medium text-brand underline-offset-2 hover:underline">
                {formatarCompetencia(c)}
              </Link>
            </span>
          );
        })}
        . Cada mês se publica na visão do mês.
      </p>
    </Aviso>
  );
}

/**
 * "Por mês" e "Ano inteiro" trocam o período do relatório. Eram abas embaixo
 * da fileira dos filtros; com as quatro DREs em abas no alto (05/11/2026,
 * escolha 5A do Kauan), viram um seletor na fileira, ao lado do mês. Não
 * confundir com "Visão: Equipe | Cliente" (`ControleDaVisao`), que vem antes
 * dele na mesma fileira.
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

