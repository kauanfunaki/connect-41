import { notFound, redirect } from "next/navigation";
import { RECORTES_A_PAGAR, RECORTES_A_RECEBER } from "@/lib/financeiro/exportacao";
import { instanciaDoFinanceiro } from "@/lib/integracoes/omie/contas";
import { Wallet, AlertTriangle, CalendarClock, CheckCircle2, List, BarChart3 } from "lucide-react";
import { BotaoDeExportar } from "@/components/shared/BotaoDeExportar";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { listarContas, competenciasComContas, type TipoDeConta } from "@/lib/financeiro/data";
import { saoPauloParts } from "@/lib/agenda";
import { getModuleDef } from "@/lib/module-catalog";
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
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Aviso } from "@/components/ui/Aviso";
import { formatarCompetencia, formatarNumero, formatarReaisDeCentavos } from "@/lib/format";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresaNaUrl, hrefDaEmpresa, idDaEscolha } from "@/lib/empresas/escolhaDaEmpresa";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";

// Os recortes moram com a exportação (`lib/financeiro/exportacao`), que lê o mesmo.
const RECORTES = RECORTES_A_RECEBER;

/**
 * A tela de contas, que serve a pagar e a receber.
 *
 * Uma só porque **são a mesma tela com outro sinal**: o Connect unificou
 * `Payable` e `Receivable` num `FinanceEntry` com `kind`, e duplicar o
 * componente aqui reintroduziria pela porta dos fundos a separação que o
 * schema já resolveu. O que muda é o rótulo da contraparte (fornecedor ×
 * cliente) e o do total.
 */
export async function ContasPage({
  kind,
  modulo,
  searchParams,
}: {
  kind: TipoDeConta;
  modulo: string;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // O setor não é constante: é o que opera o módulo neste tenant
  // (`setorDoModulo`), então a tela acompanha uma transferência.
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !getModuleDef(modulo)) notFound();
  const sector = await setoresDoModulo(ctx.tenantId, modulo);
  if (!sector || !canActOnSector(ctx, sector)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, modulo))) notFound();

  const params = await searchParams;
  const aPagar = kind === "PAGAR";
  const recortes = aPagar ? RECORTES_A_PAGAR : RECORTES;
  // Favoritos antigos deixam de aplicar o filtro que foi removido.
  if (aPagar && params.recorte === "abertas") {
    const q = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (valor && chave !== "recorte") q.set(chave, valor);
    }
    redirect(q.size ? `/pagar?${q}` : "/pagar");
  }
  // A análise lê sempre o recorte "em aberto": faixa de atraso de conta paga
  // não existe, e a soma das faixas precisa bater com o total do topo.
  const aba = params.aba === "analise" ? "analise" : "contas";
  const recorte =
    aba === "analise" ? "abertas" : recortes.find((r) => r.chave === params.recorte)?.chave ?? "todas";

  const prisma = getPrisma();
  const agora = new Date();
  const base = aPagar ? "/pagar" : "/receber";

  // A empresa vem antes de tudo (13/10/2026): a da URL, a última aberta pela
  // pessoa, ou nenhuma — e aí a tela pede, sem ler conta nenhuma. "Todas as
  // empresas" continua, como escolha explícita (`?empresa=todas`): a lista para
  // em mil contas e os totais são somados no banco, então a consulta tem teto.
  const [empresasDoEscritorio, empresasComContas] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      select: CAMPOS_DA_EMPRESA_NO_SELETOR,
    }),
    // O seletor oferece só quem tem conta deste lado — são quase quatrocentas
    // empresas no escritório, e a maioria não é cliente do BPO.
    prisma.financeEntry.groupBy({ by: ["companyId"], where: { tenantId: ctx.tenantId, kind } }),
  ]);
  const empresas = empresasDoEscritorio.map((e) => ({
    id: e.id,
    nome: nomeExibicao(e),
    logoUrl: e.logoUrl,
    cnpj: e.cnpj,
    matrizId: e.parentCompanyId,
  })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const { escolha } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { permitirTodas: true });
  const empresaId = idDaEscolha(escolha);
  const comConta = new Set(empresasComContas.map((e) => e.companyId));
  const noSeletor = empresas.filter((e) => comConta.has(e.id) || e.id === empresaId);
  const titulo = aPagar ? "Contas a pagar" : "Contas a receber";
  const subtitulo = aPagar
    ? "O que as empresas têm a pagar, do documento fiscal à baixa — pelo valor líquido, já com as retenções."
    : "O que as empresas têm a receber, do documento fiscal emitido ao recebimento.";
  // Trocar de empresa conserva a aba, a competência e o recorte.
  const filtroDaEmpresa = (
    <FiltroDaEmpresa
      acao={base}
      empresas={noSeletor}
      valor={empresaNaUrl(escolha) ?? null}
      todas="explicita"
      manter={{ aba: params.aba === "analise" ? "analise" : undefined, competencia: params.competencia, recorte: params.recorte }}
    />
  );

  if (escolha.tipo === "escolher") {
    return (
      <PageContainer>
        <PageHeader title={titulo} subtitle={subtitulo} />
        {filtroDaEmpresa}
        <EscolhaAEmpresa
          escolha={escolha}
          porQue="Para não carregar as contas de todos os clientes de uma vez, a tela abre numa empresa."
          todasHref={hrefDaEmpresa(base, "", { todas: "explicita", manter: { recorte: params.recorte } })}
        />
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
  const lidaDoOmie = empresaId
    ? await prisma.company
        .findFirst({ where: { id: empresaId, tenantId: ctx.tenantId }, select: { omieCutoverAt: true } })
        .then(async (e) =>
          e && !e.omieCutoverAt
            ? Boolean(
                await prisma.tenantIntegration.findFirst({
                  where: { tenantId: ctx.tenantId, integrationCode: "omie", instanceKey: instanciaDoFinanceiro(empresaId), enabled: true },
                  select: { id: true },
                })
              )
            : false
        )
    : false;

  const [resultado, competencias] = await Promise.all([
    listarContas(
      ctx.tenantId,
      kind,
      { recorte, competencia: params.competencia, empresaId: empresaId ?? undefined },
      agora
    ),
    competenciasComContas(ctx.tenantId, kind, empresaId ?? undefined),
  ]);

  // Selo de cobrança só em a receber, e só na aba de contas — a análise não lista título.
  const cobranca =
    !aPagar && aba === "contas" && cobrancaLigada && canActOnSector(ctx, setorDaCobranca ?? "bpo")
      ? await situacoesDeCobranca(ctx.tenantId, resultado.linhas.map((l) => l.id), saoPauloParts(agora).dateKey)
      : null;

  // Centros ativos das empresas que aparecem na lista, para a barra de definir
  // centro. Sem nenhum centro cadastrado, nem a coluna de seleção aparece.
  // Os adiantamentos da empresa (lote D, 20/10): por empresa, como a conta de adiantamento.
  const tipoDoAdiantamentoDaTela = tipoDoAdiantamento(kind);
  const [saldosDoAdiantamento, adiantamentosDaTela] =
    empresaId && aba === "contas"
      ? await Promise.all([
          saldosDeAdiantamento(prisma, ctx.tenantId, empresaId, tipoDoAdiantamentoDaTela),
          adiantamentosLancados(prisma, ctx.tenantId, empresaId, tipoDoAdiantamentoDaTela),
        ])
      : [[], []];
  // Os cartões de crédito da empresa (lote D, 20/10), com as faturas: só em contas a pagar.
  const cartoes = aPagar && empresaId && aba === "contas" ? await cartoesDaEmpresa(prisma, ctx.tenantId, empresaId) : [];

  const empresasDaLista = [...new Set(resultado.linhas.map((l) => l.empresaId))];
  const centros =
    aba === "contas" && empresasDaLista.length > 0
      ? await prisma.costCenter.findMany({
          where: { tenantId: ctx.tenantId, companyId: { in: empresasDaLista }, active: true },
          select: { id: true, name: true, companyId: true },
          orderBy: { name: "asc" },
        })
      : [];
  const temCentroNaLista = resultado.linhas.some((l) => l.centroDeCustoId !== null);
  const empresasComCentros = empresas
    .filter((e) => empresasDaLista.includes(e.id))
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      centros: centros.filter((c) => c.companyId === e.id).map((c) => ({ id: c.id, nome: c.name })),
    }));
  // A tela já exige atuar no setor do módulo, que é o que a action confere.
  const podeDefinirCentro = centros.length > 0 || temCentroNaLista;

  function comParam(chave: string, valor: string | undefined) {
    const q = new URLSearchParams();
    if (params.competencia) q.set("competencia", params.competencia);
    // A empresa vai explícita, inclusive "todas": sem ela, o link voltaria à última aberta.
    const empresaDoLink = empresaNaUrl(escolha);
    if (empresaDoLink) q.set("empresa", empresaDoLink);
    if (recorte !== "todas" && (!aPagar || recorte !== "abertas")) q.set("recorte", recorte);
    if (aba === "analise") q.set("aba", "analise");
    if (valor) q.set(chave, valor);
    else q.delete(chave);
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
          { chave: "analise", rotulo: "Análise — atraso e ranking", href: comParam("aba", "analise"), icone: <BarChart3 /> },
        ]}
        ativa={aba}
      />

      {/* Os quatro cartões permanecem na mesma grade em todos os recortes.
          Pago/Recebido mostra zero quando as contas liquidadas ficam fora do filtro. */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: aPagar ? "A vencer" : "Em aberto",
            valor: formatarReaisDeCentavos(aPagar ? resultado.totais.aVencer : resultado.totais.emAberto),
            icone: <Wallet />,
            href: aba === "contas" ? comParam("recorte", params.recorte === (aPagar ? "avencer" : "abertas") ? undefined : (aPagar ? "avencer" : "abertas")) : undefined,
            ativo: aba === "contas" && params.recorte === (aPagar ? "avencer" : "abertas"),
          },
          {
            rotulo: "Vencido",
            valor: formatarReaisDeCentavos(resultado.totais.vencido),
            tom: resultado.totais.vencido > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
            href: aba === "contas" ? comParam("recorte", params.recorte === "vencidas" ? undefined : "vencidas") : undefined,
            ativo: aba === "contas" && params.recorte === "vencidas",
          },
          {
            rotulo: "Vence hoje",
            valor: formatarReaisDeCentavos(resultado.totais.venceHoje),
            tom: resultado.totais.venceHoje > 0 ? "text-warning-fg" : undefined,
            icone: <CalendarClock />,
            href: aPagar && aba === "contas" ? comParam("recorte", params.recorte === "hoje" ? undefined : "hoje") : undefined,
            ativo: aPagar ? aba === "contas" && params.recorte === "hoje" : undefined,
          },
          {
            rotulo: aPagar ? "Pago" : "Recebido",
            valor: formatarReaisDeCentavos(resultado.totais.pago),
            tom: "text-fg-muted",
            icone: <CheckCircle2 />,
          },
        ]}
      />

      {/* A Análise é relatório da tela inteira: o Filtros fica fora de casco.
          Na lista, vai na barra da tabela (05/10/2026). */}
      {aba === "analise" ? (
        <>
          <FiltrosDaTela campos={filtros} className="mb-4" />
          {resultado.limitada && (
            <Aviso tom="atencao" className="mb-4">
              A análise considera as {formatarNumero(resultado.linhas.length, 0)} contas de vencimento mais antigo, de{" "}
              {formatarNumero(resultado.totalNoRecorte, 0)} em aberto. Filtre por competência ou empresa para ver o resto.
            </Aviso>
          )}
          <AnaliseDeContas linhas={resultado.linhas} hojeKey={saoPauloParts(agora).dateKey} aPagar={aPagar} />
        </>
      ) : (
        <>
          {empresaId && (
            <AdiantamentosDaEmpresa companyId={empresaId} aPagar={aPagar} saldos={saldosDoAdiantamento} lancados={adiantamentosDaTela} />
          )}
          {empresaId && aPagar && <CartoesDaEmpresa companyId={empresaId} cartoes={cartoes} />}
          {resultado.linhas.length > 0 && (
            <AcoesEmLoteDasContas empresas={empresasComCentros} comCentro={podeDefinirCentro} aPagar={aPagar} hojeISO={saoPauloParts(agora).dateKey} />
          )}
          <CascoDaTabela
            contagem={contarItens(resultado.linhas.length, "conta", "contas", resultado.limitada)}
            filtros={<FiltrosDaTela campos={filtros} naBarra />}
            // A lista em Excel (numa Tabela do Excel, pronta para a tabela
            // dinâmica) ou em CSV, com a empresa, a competência e o recorte da
            // tela (lote D, 20/10).
            acoes={
              <BotaoDeExportar
                href={`${base}/exportar?${new URLSearchParams({
                  empresa: empresaNaUrl(escolha) ?? "",
                  recorte,
                  ...(params.competencia ? { competencia: params.competencia } : {}),
                })}`}
                dica="Vai a lista com a empresa, a competência e o recorte escolhidos. Os funis das colunas não entram."
              />
            }
          >
            <ContasTable
              linhas={resultado.linhas}
              kind={kind}
              filtrado={resultado.totalGeral > 0 && resultado.linhas.length === 0}
              hojeISO={saoPauloParts(agora).dateKey}
              podeAbrirPendencia={podeAbrirPendencia}
              podeEnviarParaAprovacao={podeEnviarParaAprovacao}
              cobranca={cobranca}
              selecionar
              mostrarCentro={podeDefinirCentro}
              mostrarEmpresa={!empresaId}
            />
            {/* Os totais do topo são do recorte inteiro (somados no banco); só
                a lista para no teto — e diz que parou (08/10/2026). */}
            {resultado.limitada && (
              <p className="text-micro text-fg-muted mt-3">
                Mostrando {formatarNumero(resultado.linhas.length, 0)} de {formatarNumero(resultado.totalNoRecorte, 0)} contas.
                Os totais acima somam todas. Filtre por competência ou empresa para ver o resto na lista.
              </p>
            )}
          </CascoDaTabela>
        </>
      )}
    </PageContainer>
  );
}
