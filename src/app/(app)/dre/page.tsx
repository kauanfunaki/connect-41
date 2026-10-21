import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Eye, FileText, CalendarDays, CalendarRange, FileSpreadsheet } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, type AuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/shared/PageContainer";
import { EscolhaAEmpresa, FiltroDaEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela, type FocoNaTela } from "@/lib/empresas/ultimaEmpresa";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { formatarCompetencia, formatarCompetenciaNumerica, formatarReaisDeCentavos as moeda } from "@/lib/format";
import { AvisoDeSemGrupo, BotaoDeClassificar, PainelDeClassificacao } from "@/components/dre/PainelDeClassificacao";
import { dreDoMes, dreDoAnoDaEmpresa, mesesComMovimento } from "@/lib/dre/data";
import { dreDoAno } from "@/lib/dre/anual";
import { RelatorioAnual } from "@/components/dre/RelatorioAnual";
import { ImportarDoOmie } from "@/components/dre/ImportarDoOmie";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { TRANSFERENCIA, opcoesDaUrl, type ModeloDoDre } from "@/lib/dre/estrutura";
import { SeletorDosImpostos, sufixoDosImpostos } from "@/components/dre/SeletorDosImpostos";
import { SeletorDoModeloDoDre } from "@/components/dre/SeletorDoModeloDoDre";
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

type EmpresaNaAba = {
  id: string;
  name: string;
  tradeName: string | null;
  logoUrl: string | null;
  cnpj: string | null;
  parentCompanyId: string | null;
};

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
  const { escolha, empresa: daTela, noSeletor, foco } = await escolherEmpresaDaTela(ctx, empresa, empresas, { comFoco: true });
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
              <SeletorDeEmpresa empresas={noSeletor} foco={foco} companyId={null} visao={visao} />
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

  // "Ver como o cliente" (21/10/2026): a tela do portal desta empresa, só de
  // leitura, com o mesmo componente — sem fila, sem import, sem seletor dos
  // impostos. `mes` e `ano` aqui seguem o formato do portal ("2026-09", "2026").
  if (como === "cliente") {
    return comEmpresa(
      <PageContainer>
        <ComoOClienteVe tenantId={ctx.tenantId} companyId={companyId} params={{ mes, ano, regime }} />
      </PageContainer>
    );
  }

  // O modelo do DRE da empresa (21/10/2026) e, no padrão, as duas visões dos
  // impostos (20/10/2026): no EBITDA, o padrão; ou fora do resultado.
  const [meses, modelo, podeTrocarModelo] = await Promise.all([
    mesesComMovimento(ctx.tenantId, companyId),
    modeloDaEmpresa(ctx.tenantId, companyId),
    podeTrocarOModeloDoDre(ctx),
  ]);
  const opcoes = opcoesDaUrl(impostos, modelo);
  const seletorDoModelo = <SeletorDoModeloDoDre companyId={companyId} modelo={modelo.codigo} podeTrocar={podeTrocarModelo} />;

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
          <PageHeader
            title="DRE"
            subtitle="Demonstrativo de resultado de caixa — os doze meses lado a lado."
            action={
              <AcoesDoTopo
                companyId={companyId}
                exportar={`/dre/exportar?empresa=${companyId}&visao=ano&ano=${anoEscolhido}${sufixoDosImpostos(opcoes)}`}
                comoCliente={`/dre?empresa=${companyId}&como=cliente&ano=${anoEscolhido}`}
              />
            }
          />
          {/* Empresa e período, depois as abas — a ordem da família da DRE
              (padrão aceito pelo Kauan em 08/10/2026). */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <SeletorDeEmpresa empresas={noSeletor} foco={foco} companyId={companyId} visao={visao} impostos={impostos} />
            <FiltrosDaTela
              campos={[{ chave: "ano", rotulo: "Ano", vazioLabel: `Mais recente (${anos[0] ?? anoEscolhido})`, sempreVisivel: true, opcoes: anos.map((a) => ({ value: String(a), label: String(a) })) }]}
            />
            {modelo.impostos === "escolha" && (
              <SeletorDosImpostos opcoes={opcoes} base="/dre" params={{ empresa: companyId, visao: "ano", ano: String(anoEscolhido) }} />
            )}
            {seletorDoModelo}
            <BotaoDeClassificar />
          </div>
          <AbasDaVisao companyId={companyId} ativa="ano" ano={anoEscolhido} sufixo={sufixoDosImpostos(opcoes)} />
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
        <SeletorDeEmpresa empresas={noSeletor} foco={foco} companyId={companyId} visao={visao} />
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
        <PageHeader
          title="DRE"
          subtitle={`Demonstrativo de resultado de caixa de ${rotuloDoMes(escolhido)} — monta do que foi pago e recebido no mês.`}
          action={
            <AcoesDoTopo
              companyId={companyId}
              exportar={`/dre/exportar?empresa=${companyId}&visao=mes&mes=${escolhido.ano}-${escolhido.mes}${sufixoDosImpostos(opcoes)}`}
              comoCliente={`/dre?empresa=${companyId}&como=cliente&mes=${competenciaDe(escolhido.ano, escolhido.mes)}`}
            />
          }
        />

        {/* Empresa e período, depois as abas, os números do topo e a tabela — a
            ordem da família da DRE, como na DRE econômica, nas análises e no
            orçamento (padrão aceito pelo Kauan em 08/10/2026). O mês vinha
            embaixo das abas. Numa lista com busca, e não 18 pílulas numa
            fileira — a regra da conferência de 30/09 para competência. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <SeletorDeEmpresa empresas={noSeletor} foco={foco} companyId={companyId} visao={visao} impostos={impostos} />
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
          {modelo.impostos === "escolha" && <SeletorDosImpostos opcoes={opcoes} base="/dre" params={{ empresa: companyId, mes }} />}
          {seletorDoModelo}
          <BotaoDeClassificar />
        </div>
        <AbasDaVisao companyId={companyId} ativa="mes" ano={escolhido.ano} sufixo={sufixoDosImpostos(opcoes)} />

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

        <RelatorioDoDre resultado={resultado} />

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
 * regra do modelo; no padrão, a visão escolhida no seletor dos impostos.
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
 * O "Ver como o cliente" (21/10/2026): o corpo de `/portal/dre` desta empresa,
 * com as mesmas regras do portal — a aba Competência só com a DRE econômica
 * ligada, e o aviso quando o escritório bloqueou a tela para os clientes.
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
  // Volta para o mesmo período, no formato da tela da equipe ("2026-9").
  const doPortal = params.mes?.match(/^(\d{4})-(\d{2})$/);
  const voltar = params.ano
    ? `/dre?empresa=${companyId}&visao=ano&ano=${params.ano}`
    : `/dre?empresa=${companyId}${doPortal ? `&mes=${doPortal[1]}-${Number(doPortal[2])}` : ""}`;
  return (
    <>
      <PageHeader
        title="DRE — como o cliente vê"
        subtitle="A DRE desta empresa exatamente como aparece no portal do cliente. Só leitura."
        action={
          <Button href={voltar} variant="secondary" size="sm">
            <ArrowLeft size={14} /> Voltar à DRE da equipe
          </Button>
        }
      />
      {bloqueada && (
        <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
          <span className="text-fg">
            Hoje o cliente <strong>não vê</strong> esta tela: a DRE está bloqueada no portal. Abaixo, o que ele veria se ela
            fosse liberada.
          </span>
        </Aviso>
      )}
      <DreDoCliente
        tenantId={tenantId}
        companyId={companyId}
        params={params}
        competenciaLiberada={modulos.has("dre_economica")}
        acao="/dre"
        manter={{ como: "cliente" }}
      />
    </>
  );
}

/**
 * As ações do topo: trazer do Omie e levar no modelo do BPO, lado a lado
 * (13/10/2026 — o import era um cartão no pé da tela), e o "Ver como o
 * cliente" no mesmo período (21/10/2026).
 */
function AcoesDoTopo({ companyId, exportar, comoCliente }: { companyId: string; exportar: string; comoCliente: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button href={comoCliente} variant="secondary" size="sm">
        <Eye size={14} /> Ver como o cliente
      </Button>
      <ImportarDoOmie companyId={companyId} />
      <ExportarNoModeloDoBpo href={exportar} />
    </div>
  );
}

/**
 * A DRE da tela no desenho da planilha que o BPO entrega (13/10/2026): mesma
 * empresa, mesmo período. `download`, e não `<Link>`: o pré-carregamento
 * geraria a planilha só de a tela abrir.
 */
function ExportarNoModeloDoBpo({ href }: { href: string }) {
  return (
    <Button href={href} download variant="secondary" size="sm">
      <FileSpreadsheet size={14} /> Exportar no modelo do BPO
    </Button>
  );
}

/** "Por mês" e "Ano inteiro" trocam a tela — são abas, não filtro. */
function AbasDaVisao({ companyId, ativa, ano, sufixo }: { companyId: string; ativa: "mes" | "ano"; ano: number; sufixo: string }) {
  return (
    <AbasDeLink
      ativa={ativa}
      abas={[
        { chave: "mes", rotulo: "Por mês", href: `/dre?empresa=${companyId}${sufixo}`, icone: <CalendarDays /> },
        { chave: "ano", rotulo: "Ano inteiro", href: `/dre?empresa=${companyId}&visao=ano&ano=${ano}${sufixo}`, icone: <CalendarRange /> },
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

/**
 * O seletor das telas da equipe (13/10/2026), que grava a escolha como a
 * última empresa aberta. Trocar de empresa conserva a visão (mês ou ano); o
 * mês e o ano ficam para trás, porque os meses com movimento são de cada empresa.
 */
function SeletorDeEmpresa({
  empresas,
  companyId,
  visao,
  impostos,
  foco,
}: {
  empresas: EmpresaNaAba[];
  companyId: string | null;
  visao: string | undefined;
  impostos?: string;
  /** A empresa em foco (21/10/2026) — a fileira avisa o endereço que pedia outra. */
  foco: FocoNaTela | null;
}) {
  return (
    <FiltroDaEmpresa
      className=""
      empresas={empresas.map((e) => ({ ...e, nome: e.tradeName || e.name }))}
      valor={companyId}
      acao="/dre"
      manter={{ visao: visao === "ano" ? "ano" : undefined, impostos: impostos === "fora" ? "fora" : undefined }}
      foco={foco}
    />
  );
}
