import { notFound } from "next/navigation";
import { Wallet, AlertTriangle, CalendarClock, CheckCircle2, List, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { listarContas, competenciasComContas, type TipoDeConta } from "@/lib/financeiro/data";
import { saoPauloParts } from "@/lib/agenda";
import { getModuleDef } from "@/lib/module-catalog";
import { ContasTable } from "./ContasTable";
import { AnaliseDeContas } from "./AnaliseDeContas";
import { AbasDeLink, FaixaDeTotais } from "./FiltroDePeriodo";
import { situacoesDeCobranca, MODULO_DE_COBRANCA } from "@/lib/financeiro/cobranca/consultas";
import { DefinirCentroDasContas } from "./DefinirCentroDasContas";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Aviso } from "@/components/ui/Aviso";
import { formatarCompetencia, formatarNumero, formatarReaisDeCentavos } from "@/lib/format";

const RECORTES = [
  { chave: "abertas", rotulo: "Em aberto" },
  { chave: "vencidas", rotulo: "Vencidas" },
  { chave: "todas", rotulo: "Todas" },
] as const;

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
  const sector = await setorDoModulo(ctx.tenantId, modulo);
  if (!sector || !canActOnSector(ctx, sector)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, modulo))) notFound();

  const params = await searchParams;
  // A análise lê sempre o recorte "em aberto": faixa de atraso de conta paga
  // não existe, e a soma das faixas precisa bater com o total do topo.
  const aba = params.aba === "analise" ? "analise" : "contas";
  const recorte =
    aba === "analise" ? "abertas" : RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "abertas";

  const prisma = getPrisma();
  const agora = new Date();

  // Os atalhos para os módulos vizinhos aparecem só para quem atua neles, com
  // eles ligados — link para uma tela que responde 404 é pior que nenhum.
  const [pendenciasLigado, aprovacoesLigado, cobrancaLigada, setorDePendencias, setorDeAprovacoes, setorDaCobranca] = await Promise.all([
    isModuleEnabled(ctx.tenantId, "bpo_pendencias"),
    isModuleEnabled(ctx.tenantId, "bpo_aprovacoes"),
    isModuleEnabled(ctx.tenantId, MODULO_DE_COBRANCA),
    setorDoModulo(ctx.tenantId, "bpo_pendencias"),
    setorDoModulo(ctx.tenantId, "bpo_aprovacoes"),
    setorDoModulo(ctx.tenantId, MODULO_DE_COBRANCA),
  ]);
  const podeAbrirPendencia = pendenciasLigado && canActOnSector(ctx, setorDePendencias ?? "bpo");
  const podeEnviarParaAprovacao = kind === "PAGAR" && aprovacoesLigado && canActOnSector(ctx, setorDeAprovacoes ?? "bpo");

  const [resultado, competencias, empresas, empresasComContas] = await Promise.all([
    listarContas(
      ctx.tenantId,
      kind,
      { recorte, competencia: params.competencia, empresaId: params.empresa },
      agora
    ),
    competenciasComContas(ctx.tenantId, kind),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
    // O filtro de empresa oferece só quem tem conta deste lado — são quase
    // quatrocentas empresas no escritório, e a maioria não é cliente do BPO.
    prisma.financeEntry.groupBy({ by: ["companyId"], where: { tenantId: ctx.tenantId, kind } }),
  ]);

  const aPagar = kind === "PAGAR";
  const base = aPagar ? "/pagar" : "/receber";
  // Selo de cobrança só em a receber, e só na aba de contas — a análise não lista título.
  const cobranca =
    !aPagar && aba === "contas" && cobrancaLigada && canActOnSector(ctx, setorDaCobranca ?? "bpo")
      ? await situacoesDeCobranca(ctx.tenantId, resultado.linhas.map((l) => l.id), saoPauloParts(agora).dateKey)
      : null;

  // Centros ativos das empresas que aparecem na lista, para a barra de definir
  // centro. Sem nenhum centro cadastrado, nem a coluna de seleção aparece.
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
      nome: nomeExibicao(e),
      centros: centros.filter((c) => c.companyId === e.id).map((c) => ({ id: c.id, nome: c.name })),
    }));
  // A tela já exige atuar no setor do módulo, que é o que a action confere.
  const podeDefinirCentro = centros.length > 0 || temCentroNaLista;

  function comParam(chave: string, valor: string | undefined) {
    const q = new URLSearchParams();
    if (params.competencia) q.set("competencia", params.competencia);
    if (params.empresa) q.set("empresa", params.empresa);
    if (recorte !== "abertas") q.set("recorte", recorte);
    if (aba === "analise") q.set("aba", "analise");
    if (valor) q.set(chave, valor);
    else q.delete(chave);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  }

  const comConta = new Set(empresasComContas.map((e) => e.companyId));
  const filtros: CampoDeFiltro[] = [
    // A análise lê sempre o em aberto (ver acima), então lá a situação não é filtro.
    ...(aba === "contas"
      ? [
          {
            chave: "recorte",
            rotulo: "Situação",
            vazioLabel: "Em aberto",
            opcoes: RECORTES.filter((r) => r.chave !== "abertas").map((r) => ({ value: r.chave, label: r.rotulo })),
          },
        ]
      : []),
    {
      chave: "competencia",
      rotulo: "Competência",
      vazioLabel: "Todas",
      opcoes: competencias.map((c) => ({ value: c, label: formatarCompetencia(c) })),
    },
    {
      chave: "empresa",
      rotulo: "Empresa",
      vazioLabel: "Todas",
      opcoes: empresas.filter((e) => comConta.has(e.id) || e.id === params.empresa).map((e) => ({ value: e.id, label: nomeExibicao(e) })),
    },
  ];

  return (
    <PageContainer>
      {/* Sem "Voltar": é página principal do setor, não uma ficha aberta de
          uma lista — o menu é o caminho de volta. */}
      <PageHeader
        title={aPagar ? "Contas a pagar" : "Contas a receber"}
        subtitle={
          aPagar
            ? "O que as empresas têm a pagar, do documento fiscal à baixa — pelo valor líquido, já com as retenções."
            : "O que as empresas têm a receber, do documento fiscal emitido ao recebimento."
        }
      />

      {/* Os números do topo, e o primeiro é o que a pessoa procura: quanto
          falta. Vencido em destaque porque é o que já custa. Os dois primeiros
          são atalho para o recorte que eles contam.
          "Pago"/"Recebido" só no recorte que traz as liquidadas (07/10): os
          totais são do recorte, então em "Em aberto" (o padrão) e "Vencidas"
          o cartão saía sempre R$ 0,00 — e verde. Cor neutra, como no portal:
          é histórico, não pede ação. */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Em aberto",
            valor: formatarReaisDeCentavos(resultado.totais.emAberto),
            icone: <Wallet />,
            href: aba === "contas" ? comParam("recorte", undefined) : undefined,
          },
          {
            rotulo: "Vencido",
            valor: formatarReaisDeCentavos(resultado.totais.vencido),
            tom: resultado.totais.vencido > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
            href: aba === "contas" ? comParam("recorte", "vencidas") : undefined,
          },
          {
            rotulo: "Vence hoje",
            valor: formatarReaisDeCentavos(resultado.totais.venceHoje),
            tom: resultado.totais.venceHoje > 0 ? "text-warning" : undefined,
            icone: <CalendarClock />,
          },
          ...(recorte === "todas"
            ? [{ rotulo: aPagar ? "Pago" : "Recebido", valor: formatarReaisDeCentavos(resultado.totais.pago), tom: "text-fg-muted", icone: <CheckCircle2 /> }]
            : []),
        ]}
      />

      <AbasDeLink
        abas={[
          { chave: "contas", rotulo: "Contas", href: comParam("aba", undefined), icone: <List /> },
          { chave: "analise", rotulo: "Análise — atraso e ranking", href: comParam("aba", "analise"), icone: <BarChart3 /> },
        ]}
        ativa={aba}
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
          {podeDefinirCentro && resultado.linhas.length > 0 && <DefinirCentroDasContas empresas={empresasComCentros} />}
          <CascoDaTabela
            contagem={contarItens(resultado.linhas.length, "conta", "contas", resultado.limitada)}
            filtros={<FiltrosDaTela campos={filtros} naBarra />}
          >
            <ContasTable
              linhas={resultado.linhas}
              kind={kind}
              filtrado={resultado.totalGeral > 0 && resultado.linhas.length === 0}
              hojeISO={saoPauloParts(agora).dateKey}
              podeAbrirPendencia={podeAbrirPendencia}
              podeEnviarParaAprovacao={podeEnviarParaAprovacao}
              cobranca={cobranca}
              selecionarCentro={podeDefinirCentro}
              mostrarCentro={podeDefinirCentro}
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
