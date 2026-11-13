import { notFound, redirect } from "next/navigation";
import { RECORTES_A_PAGAR, RECORTES_A_RECEBER } from "@/lib/financeiro/exportacao";
import { empresaLidaDoOmie } from "@/lib/integracoes/omie/viradaServidor";
import { Wallet, AlertTriangle, CalendarClock, CheckCircle2, List, BarChart3, HandCoins, CreditCard, Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { BotaoDeExportar } from "@/components/shared/BotaoDeExportar";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { listarContas, listarPaginaDeContas, competenciasComContas, type TipoDeConta } from "@/lib/financeiro/data";
import type { Totais } from "@/lib/financeiro/contas";
import { saoPauloParts } from "@/lib/agenda";
import { ContasTable } from "./ContasTable";
import { AnaliseDeContas } from "./AnaliseDeContas";
import { AbasDeLink, FaixaDeTotais } from "./FiltroDePeriodo";
import { situacoesDeCobranca, MODULO_DE_COBRANCA } from "@/lib/financeiro/cobranca/consultas";
import { AcoesEmLoteDasContas } from "./AcoesEmLoteDasContas";
import { AdiantamentosDaEmpresa } from "./AdiantamentosDaEmpresa";
import { CartoesDaEmpresa } from "./CartoesDaEmpresa";
import { tipoDoAdiantamento } from "@/lib/financeiro/adiantamento";
import { adiantamentosLancados, saldosDeAdiantamento } from "@/lib/financeiro/adiantamentoServidor";
import { cartoesDaEmpresa } from "@/lib/financeiro/cartaoServidor";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Pagination } from "@/components/shared/Pagination";
import { Aviso } from "@/components/ui/Aviso";
import { formatarCompetencia, formatarNumero, formatarReaisDeCentavos } from "@/lib/format";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresaNaUrl, idDaEscolha } from "@/lib/empresas/escolhaDaEmpresa";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { podeUsarATelaDeContas } from "@/lib/financeiro/acessoDaTelaDeContas";
import { linhaDaTela } from "@/lib/financeiro/linhaDaTela";
import { ehChaveDoFunil, funisDaUrl, funisNaConsulta, paginaDaUrl, temFunil, type FunisDasContas } from "@/lib/financeiro/paginaDeContas";

// Os recortes moram com a exportação (`lib/financeiro/exportacao`), que lê o mesmo.
const RECORTES = RECORTES_A_RECEBER;

/** Os parâmetros como o Next entrega: o funil das colunas repete a chave (`?categoria=a&categoria=b`). */
type ParametrosDaUrl = Record<string, string | string[] | undefined>;

/** O primeiro valor de cada parâmetro — os filtros de um valor só (empresa, recorte, competência, aba). */
function valoresUnicos(bruto: ParametrosDaUrl): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(bruto).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

/**
 * A URL de volta, com os parâmetros repetidos inteiros, menos os de `sem`. O
 * valor em branco de um funil fica: é o "(sem categoria)", e tirá-lo trocaria
 * o filtro no meio da paginação.
 */
function consultaDe(bruto: ParametrosDaUrl, sem: string[] = []): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(bruto)) {
    if (sem.includes(k)) continue;
    for (const valor of Array.isArray(v) ? v : [v]) {
      if (valor === undefined || (valor === "" && !ehChaveDoFunil(k))) continue;
      q.append(k, valor);
    }
  }
  return q;
}

/** As colunas com funil, na ordem da tabela — a faixa "Filtro nas colunas" as lista. */
const COLUNAS_COM_FUNIL = (aPagar: boolean) => [
  { chave: "vencimento", rotulo: "Vencimento" },
  { chave: "contraparte", rotulo: aPagar ? "Fornecedor" : "Cliente" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "centro", rotulo: "Centro de custo" },
  { chave: "projeto", rotulo: "Projeto" },
  { chave: "situacao", rotulo: "Situação" },
];

/**
 * A tela de contas, que serve a pagar e a receber.
 *
 * Uma só porque **são a mesma tela com outro sinal**: o Connect unificou
 * `Payable` e `Receivable` num `FinanceEntry` com `kind`, e duplicar o
 * componente aqui reintroduziria pela porta dos fundos a separação que o
 * schema já resolveu. O que muda é o rótulo da contraparte (fornecedor ×
 * cliente) e o do total.
 *
 * A lista é paginada no servidor desde 13/11/2026 (`listarPaginaDeContas`):
 * ia até mil contas de uma vez, perto de 4 MB de RSC por abertura. Os totais
 * do topo continuam somando o filtro inteiro, no banco; os funis das colunas
 * filtram pela URL.
 */
export async function ContasPage({
  kind,
  modulo,
  searchParams,
}: {
  kind: TipoDeConta;
  modulo: string;
  searchParams: Promise<ParametrosDaUrl>;
}) {
  // O setor não é constante: é o que opera o módulo neste tenant
  // (`setorDoModulo`), então a tela acompanha uma transferência.
  const ctx = await getAuthContext();
  if (!(await podeUsarATelaDeContas(ctx, modulo))) notFound();

  const bruto = await searchParams;
  const params = valoresUnicos(bruto);
  const aPagar = kind === "PAGAR";
  const base = aPagar ? "/pagar" : "/receber";
  const recortes = aPagar ? RECORTES_A_PAGAR : RECORTES;
  // Favoritos antigos deixam de aplicar o filtro que foi removido.
  if (aPagar && params.recorte === "abertas") {
    const q = consultaDe(bruto, ["recorte"]);
    redirect(q.size ? `${base}?${q}` : base);
  }
  // A análise lê sempre o recorte "em aberto": faixa de atraso de conta paga
  // não existe, e a soma das faixas precisa bater com o total do topo.
  // Adiantamentos e Cartões em aba própria (Pagar/Receber A, página de opções
  // de 04/11/2026) — eram blocos recolhíveis em cima da lista. Cartão é só de
  // contas a pagar.
  const ABAS_DA_TELA = aPagar ? (["contas", "adiantamentos", "cartoes", "analise"] as const) : (["contas", "adiantamentos", "analise"] as const);
  type Aba = "contas" | "adiantamentos" | "cartoes" | "analise";
  const aba: Aba = (ABAS_DA_TELA as readonly string[]).includes(params.aba ?? "") ? (params.aba as Aba) : "contas";
  const recorte =
    aba === "contas" ? recortes.find((r) => r.chave === params.recorte)?.chave ?? "todas" : "abertas";
  // Os funis das colunas são da lista: a análise e as outras abas não os têm.
  const funis: FunisDasContas = aba === "contas" ? funisDaUrl(bruto) : {};
  const pagina = paginaDaUrl(bruto.pagina);

  const prisma = getPrisma();
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;

  // A empresa é a da faixa "Trabalhando em" (05/11/2026): a do foco — com a
  // matriz e as filiais —, ou todas sem foco.
  const empresasDoEscritorio = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });
  const empresas = empresasDoEscritorio.map((e) => ({ id: e.id, nome: nomeExibicao(e) }));
  // Com uma empresa em foco (21/10/2026), só a base dela: a empresa, a matriz
  // e as filiais — e "Todas" é a base inteira, não o escritório.
  const daTela = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { permitirTodas: true, comFoco: true });
  const { escolha, foco, empresasDeTodas } = daTela;
  const empresaId = idDaEscolha(escolha);
  const titulo = aPagar ? "Contas a pagar" : "Contas a receber";
  const subtitulo = aPagar
    ? "O que as empresas têm a pagar, do documento fiscal à baixa — pelo valor líquido, já com as retenções."
    : "O que as empresas têm a receber, do documento fiscal emitido ao recebimento.";
  // Trocar de empresa conserva a aba, a competência e o recorte.
  const filtroDaEmpresa = <FiltroDaEmpresa foco={foco} />;

  if (escolha.tipo === "escolher") {
    return (
      <PageContainer>
        <PageHeader title={titulo} subtitle={subtitulo} />
        {filtroDaEmpresa}
        <EscolhaAEmpresa escolha={escolha} porQue="Para não carregar as contas de todos os clientes de uma vez, a tela abre numa empresa." />
      </PageContainer>
    );
  }

  // Os atalhos para os módulos vizinhos aparecem só para quem atua neles, com
  // eles ligados — link para uma tela que responde 404 é pior que nenhum.
  const [pendenciasLigado, aprovacoesLigado, cobrancaLigada, setorDePendencias, setorDeAprovacoes, setorDaCobranca] = await Promise.all([
    isModuleEnabled(ctx.tenantId, "bpo_pendencias"),
    isModuleEnabled(ctx.tenantId, "bpo_aprovacoes"),
    isModuleEnabled(ctx.tenantId, MODULO_DE_COBRANCA),
    setoresDoModulo(ctx.tenantId, "bpo_pendencias"),
    setoresDoModulo(ctx.tenantId, "bpo_aprovacoes"),
    setoresDoModulo(ctx.tenantId, MODULO_DE_COBRANCA),
  ]);
  const podeAbrirPendencia = pendenciasLigado && canActOnSector(ctx, setorDePendencias ?? "bpo");
  const podeEnviarParaAprovacao = kind === "PAGAR" && aprovacoesLigado && canActOnSector(ctx, setorDeAprovacoes ?? "bpo");

  // A empresa escolhida ainda é lida do Omie (lote E): as contas que vieram de
  // lá se pagam e cancelam no Omie até a virada — a tela diz isso no topo, em
  // vez de só recusar no clique.
  const lidaDoOmie = empresaId ? await empresaLidaDoOmie(ctx.tenantId, empresaId) : false;

  const filtro = { recorte, competencia: params.competencia, empresaId: empresaId ?? undefined, empresaIds: empresasDeTodas ?? undefined, funis };
  // Cada aba consulta só o que mostra: a lista, uma página; a análise, as em
  // aberto (até o teto); adiantamentos e cartões, nada daqui.
  const [lista, analise, competencias] = await Promise.all([
    aba === "contas" ? listarPaginaDeContas(ctx.tenantId, kind, filtro, agora, pagina) : null,
    aba === "analise" ? listarContas(ctx.tenantId, kind, filtro, agora) : null,
    aba === "contas" || aba === "analise" ? competenciasComContas(ctx.tenantId, kind, empresaId ?? empresasDeTodas ?? undefined) : [],
  ]);
  const totais: Totais | null = lista?.totais ?? analise?.totais ?? null;

  // Página além do fim (link antigo, a última esvaziou, outro filtro): vai
  // para a última que existe, com os mesmos filtros.
  if (lista && pagina > lista.totalDePaginas) {
    const q = consultaDe(bruto, ["pagina"]);
    if (lista.totalDePaginas > 1) q.set("pagina", String(lista.totalDePaginas));
    redirect(q.size ? `${base}?${q}` : base);
  }

  // Selo de cobrança só em a receber, e só na lista — a análise não lista título.
  const cobranca =
    lista && !aPagar && cobrancaLigada && canActOnSector(ctx, setorDaCobranca ?? "bpo")
      ? await situacoesDeCobranca(ctx.tenantId, lista.linhas.map((l) => l.id), hojeKey)
      : null;

  // Os adiantamentos da empresa (lote D, 20/10): por empresa, como a conta de adiantamento.
  const tipoDoAdiantamentoDaTela = tipoDoAdiantamento(kind);
  const [saldosDoAdiantamento, adiantamentosDaTela] =
    empresaId && aba === "adiantamentos"
      ? await Promise.all([
          saldosDeAdiantamento(prisma, ctx.tenantId, empresaId, tipoDoAdiantamentoDaTela),
          adiantamentosLancados(prisma, ctx.tenantId, empresaId, tipoDoAdiantamentoDaTela),
        ])
      : [[], []];
  // Os cartões de crédito da empresa (lote D, 20/10), com as faturas: só em contas a pagar.
  const cartoes = aPagar && empresaId && aba === "cartoes" ? await cartoesDaEmpresa(prisma, ctx.tenantId, empresaId) : [];

  // Centro de custo: a coluna, o funil e o campo de "Alterar marcadas" só
  // aparecem quando a empresa usa centro. Basta saber se existe um ativo — a
  // lista dos centros, a janela de alterar pede quando abre (13/11/2026); até
  // aqui a tela levava os de todas as empresas da lista.
  const linhasDaPagina = lista?.linhas ?? [];
  const temCentroNaLista = linhasDaPagina.some((l) => l.centroDeCustoId !== null);
  const empresasDoCentro = empresaId ? [empresaId] : [...new Set(linhasDaPagina.map((l) => l.empresaId))];
  const podeDefinirCentro =
    temCentroNaLista ||
    (lista !== null &&
      empresasDoCentro.length > 0 &&
      (await prisma.costCenter.findFirst({
        where: { tenantId: ctx.tenantId, companyId: { in: empresasDoCentro }, active: true },
        select: { id: true },
      })) !== null);

  const empresaDaUrl = empresaNaUrl(escolha) ?? null;
  const diaDe = (d: Date) => saoPauloParts(d).dateKey;
  const linhasDaTela = linhasDaPagina.map((l) =>
    linhaDaTela(l, { diaDe, mostrarEmpresa: !empresaId, mostrarCentro: podeDefinirCentro, cobranca: cobranca?.get(l.id) ?? null })
  );

  function comParam(chave: string, valor: string | undefined) {
    const q = new URLSearchParams();
    if (params.competencia) q.set("competencia", params.competencia);
    // A empresa vai explícita, inclusive "todas": sem ela, o link voltaria à última aberta.
    if (empresaDaUrl) q.set("empresa", empresaDaUrl);
    if (recorte !== "todas" && (!aPagar || recorte !== "abertas")) q.set("recorte", recorte);
    if (aba !== "contas") q.set("aba", aba);
    // Os cartões do topo trocam o recorte e ficam com os funis — o número do
    // cartão já é o deles. Trocar de aba deixa os funis, que são da lista.
    if (aba === "contas" && chave !== "aba") funisNaConsulta(funis, q);
    if (valor) q.set(chave, valor);
    else q.delete(chave);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  }

  // A página n da lista, com todos os filtros da URL — o funil repetido inclusive.
  function hrefDaPagina(n: number) {
    const q = consultaDe(bruto, ["pagina"]);
    if (n > 1) q.set("pagina", String(n));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  }

  // A empresa saiu do "Filtros" (13/10/2026): é o seletor da fileira de cima.
  const filtros: CampoDeFiltro[] = [
    // A análise lê sempre o em aberto (ver acima), então lá a situação não é filtro.
    ...(aba === "contas"
      ? [
          {
            chave: "recorte",
            rotulo: "Situação",
            vazioLabel: "Todas",
            opcoes: recortes.filter((r) => r.chave !== "todas").map((r) => ({ value: r.chave, label: r.rotulo })),
          },
        ]
      : []),
    {
      chave: "competencia",
      rotulo: "Competência",
      vazioLabel: "Todas",
      opcoes: competencias.map((c) => ({ value: c, label: formatarCompetencia(c) })),
    },
  ];

  const semDado = lista !== null && lista.totalGeral === 0 && !params.competencia && recorte === "todas";

  // A exportação leva o que a tela filtra — a empresa, a competência, a
  // situação e os funis das colunas —, de todas as páginas.
  const consultaDaExportacao = new URLSearchParams({
    empresa: empresaDaUrl ?? "",
    recorte,
    ...(params.competencia ? { competencia: params.competencia } : {}),
  });
  funisNaConsulta(funis, consultaDaExportacao);

  return (
    <PageContainer>
      {/* Sem "Voltar": é página principal do setor, não uma ficha aberta de
          uma lista — o menu é o caminho de volta. */}
      <PageHeader title={titulo} subtitle={subtitulo} />
      {filtroDaEmpresa}
      {lidaDoOmie && (
        <Aviso tom="marca" className="mb-4">
          As contas desta empresa ainda são lidas do Omie: as que vieram de lá se pagam, cancelam e alteram no Omie, e a
          leitura traz para cá a cada 6 horas. Quando o BPO passar a trabalhar só no Connect, faça a virada em
          Configurações › Integrações › Omie por empresa.
        </Aviso>
      )}

      {/* Na ordem empresa → abas → totais → lista (15/10/2026): as abas
          vinham depois dos cartões. */}
      <AbasDeLink
        abas={[
          { chave: "contas", rotulo: "Contas", href: comParam("aba", undefined), icone: <List /> },
          { chave: "adiantamentos", rotulo: "Adiantamentos", href: comParam("aba", "adiantamentos"), icone: <HandCoins /> },
          ...(aPagar ? [{ chave: "cartoes", rotulo: "Cartões", href: comParam("aba", "cartoes"), icone: <CreditCard /> }] : []),
          { chave: "analise", rotulo: "Análise", href: comParam("aba", "analise"), icone: <BarChart3 /> },
        ]}
        ativa={aba}
      />

      {/* Os quatro cartões permanecem na mesma grade em todos os recortes.
          Pago/Recebido mostra zero quando as contas liquidadas ficam fora do
          filtro. Somam o filtro inteiro, no banco — não a página. */}
      {totais && (
      <FaixaDeTotais
        itens={[
          {
            rotulo: aPagar ? "A vencer" : "Em aberto",
            valor: formatarReaisDeCentavos(aPagar ? totais.aVencer : totais.emAberto),
            icone: <Wallet />,
            href: aba === "contas" ? comParam("recorte", params.recorte === (aPagar ? "avencer" : "abertas") ? undefined : (aPagar ? "avencer" : "abertas")) : undefined,
            ativo: aba === "contas" && params.recorte === (aPagar ? "avencer" : "abertas"),
          },
          {
            rotulo: "Vencido",
            valor: formatarReaisDeCentavos(totais.vencido),
            tom: totais.vencido > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
            href: aba === "contas" ? comParam("recorte", params.recorte === "vencidas" ? undefined : "vencidas") : undefined,
            ativo: aba === "contas" && params.recorte === "vencidas",
          },
          {
            rotulo: "Vence hoje",
            valor: formatarReaisDeCentavos(totais.venceHoje),
            tom: totais.venceHoje > 0 ? "text-warning-fg" : undefined,
            icone: <CalendarClock />,
            href: aPagar && aba === "contas" ? comParam("recorte", params.recorte === "hoje" ? undefined : "hoje") : undefined,
            ativo: aPagar ? aba === "contas" && params.recorte === "hoje" : undefined,
          },
          {
            rotulo: aPagar ? "Pago" : "Recebido",
            valor: formatarReaisDeCentavos(totais.pago),
            tom: "text-fg-muted",
            icone: <CheckCircle2 />,
          },
        ]}
      />
      )}

      {/* A Análise é relatório da tela inteira: o Filtros fica fora de casco.
          Na lista, vai na barra da tabela (05/10/2026). */}
      {(aba === "adiantamentos" || aba === "cartoes") && !empresaId ? (
        <EmptyState
          title="Escolha uma empresa"
          description={aba === "cartoes" ? "Os cartões de crédito são de cada empresa." : "Os adiantamentos são de cada empresa, como a conta de adiantamento."}
          icon={<Building2 />}
        />
      ) : aba === "adiantamentos" && empresaId ? (
        <AdiantamentosDaEmpresa companyId={empresaId} aPagar={aPagar} saldos={saldosDoAdiantamento} lancados={adiantamentosDaTela} />
      ) : aba === "cartoes" && empresaId ? (
        <CartoesDaEmpresa companyId={empresaId} cartoes={cartoes} />
      ) : analise ? (
        <>
          <FiltrosDaTela campos={filtros} className="mb-4" />
          {analise.limitada && (
            <Aviso tom="atencao" className="mb-4">
              A análise considera as {formatarNumero(analise.linhas.length, 0)} contas de vencimento mais antigo, de{" "}
              {formatarNumero(analise.totalNoRecorte, 0)} em aberto. Filtre por competência ou empresa para ver o resto.
            </Aviso>
          )}
          <AnaliseDeContas linhas={analise.linhas} hojeKey={hojeKey} aPagar={aPagar} />
        </>
      ) : lista ? (
        <>
          {linhasDaTela.length > 0 && (
            <AcoesEmLoteDasContas comCentro={podeDefinirCentro} aPagar={aPagar} hojeISO={hojeKey} paginada={lista.totalDePaginas > 1} />
          )}
          <CascoDaTabela
            // O total do filtro, não o da página: "312 contas", e a paginação
            // embaixo diz em qual página se está.
            contagem={contarItens(lista.totalNoRecorte, "conta", "contas")}
            // Empresa sem conta nenhuma deste lado: nada a filtrar nem a
            // exportar (lote A de 03/11/2026). Com filtro escolhido, o botão
            // fica, para dar como tirá-lo.
            filtros={semDado ? undefined : <FiltrosDaTela campos={filtros} naBarra />}
            // A lista em Excel (numa Tabela do Excel, pronta para a tabela
            // dinâmica) ou em CSV, com os filtros da tela (lote D, 20/10).
            acoes={
              !semDado && (
                <BotaoDeExportar
                  href={`${base}/exportar?${consultaDaExportacao}`}
                  dica="Vai a lista inteira, de todas as páginas, com a empresa, a competência, a situação e os filtros das colunas."
                />
              )
            }
          >
            {/* Acima da tabela e do estado vazio: é por aqui que se desfaz o
                funil quando ele esvazia a lista. */}
            {temFunil(funis) && <FiltrosDasColunasNaUrl colunas={COLUNAS_COM_FUNIL(aPagar)} />}
            <ContasTable
              linhas={linhasDaTela}
              kind={kind}
              filtrado={lista.totalGeral > 0 && lista.totalNoRecorte === 0}
              hojeISO={hojeKey}
              empresa={empresaDaUrl}
              podeAbrirPendencia={podeAbrirPendencia}
              podeEnviarParaAprovacao={podeEnviarParaAprovacao}
              selecionar
              mostrarCentro={podeDefinirCentro}
              comProjeto={linhasDaTela.some((l) => l.projeto) || funis.projeto !== undefined}
              mostrarEmpresa={!empresaId}
            />
          </CascoDaTabela>
          {/* Fora do casco, como nas outras listas paginadas (Empresas, acervo fiscal). */}
          <Pagination page={pagina} totalPages={lista.totalDePaginas} total={lista.totalNoRecorte} rotulo="contas" buildHref={hrefDaPagina} />
        </>
      ) : null}
    </PageContainer>
  );
}
