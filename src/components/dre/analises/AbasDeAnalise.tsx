// As sete abas de `/dre/analises`. Componentes de servidor que buscam o
// próprio dado: só a aba aberta consulta o banco.

import Link from "next/link";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { saoPauloParts } from "@/lib/agenda";
import {
  serieEconomica,
  serieDeCaixa,
  dadosDaReconciliacao,
  paresDeLiquidacao,
  resultadoDoPeriodo,
} from "@/lib/dre/dataEconomica";
import {
  reconciliarLucroCaixa,
  compararResultados,
  atrasoMedioEmDias,
  projetarSerie,
  calcularIndicadores,
  METODOS_DE_PROJECAO,
  type MetodoDeProjecao,
  type Indicador,
  type LinhaComparada,
} from "@/lib/dre/analises";
import { rotuloEconomico, valorDaLinha, LINHA_DE_RESULTADO, LINHA_OPERACIONAL } from "@/lib/dre/economica";
import { responderAoCfo, PERGUNTAS_DO_CFO, type ChaveDaPergunta } from "@/lib/dre/cfo";
import { titulosEmAberto, movimentosRealizados } from "@/lib/financeiro/consultas";
import { fluxoRealizado, abertosPorMes, projecaoPorJanela } from "@/lib/financeiro/fluxo";
import { rankingDeContrapartes } from "@/lib/financeiro/analise";
import {
  somarMeses,
  competenciasAte,
  acumuladoDoAno,
  rotuloDaCompetencia,
  partesDaCompetencia,
  diasNoMes,
} from "@/lib/financeiro/periodo";
import { moeda, percentual, dias, tomDoValor } from "@/lib/financeiro/formato";
import { SimuladorDeCenarios } from "./SimuladorDeCenarios";

type Base = { tenantId: string; companyId: string; mes: string };

const TH = "py-2 pr-3 font-medium";
const CABECALHO = "text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border";

function NotaDeFonte({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-fg-muted mt-3">
      <Info size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function TabelaComparada({ linhas, rotuloA, rotuloB, destacarAcima }: { linhas: LinhaComparada[]; rotuloA: string; rotuloB: string; destacarAcima?: number }) {
  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className={CABECALHO}>
            <th className={`${TH} pl-4`}>Linha</th>
            <th className={`${TH} text-right`}>{rotuloA}</th>
            <th className={`${TH} text-right`}>{rotuloB}</th>
            <th className={`${TH} text-right`}>Diferença</th>
            <th className={`${TH} pr-4 text-right`}>Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const relevante = destacarAcima !== undefined && l.variacao !== null && Math.abs(l.variacao) >= destacarAcima;
            return (
              <tr key={l.code} className="border-b border-border-soft">
                <td className="py-2 pl-4 pr-3 text-fg-secondary">{l.label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.atual)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.comparado)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${tomDoValor(l.diferenca)}`}>{moeda(l.diferenca)}</td>
                <td className={`py-2 pr-4 text-right tabular-nums ${relevante ? "text-warning font-semibold" : "text-fg-muted"}`}>
                  <span className="inline-flex items-center gap-1">
                    {relevante && <AlertTriangle size={12} />}
                    {percentual(l.variacao)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const LINHAS_PRINCIPAIS = [
  "receita_bruta",
  "cmv",
  "mao_de_obra",
  "comerciais",
  "margem_contribuicao",
  "total_despesas_fixas",
  LINHA_OPERACIONAL,
  "investimentos",
  LINHA_DE_RESULTADO,
];

// ─── Econômico × financeiro ─────────────────────────────────────────────────

export async function AbaEconomicoFinanceiro({ tenantId, companyId, mes }: Base) {
  const [econ, caixa, pares] = await Promise.all([
    serieEconomica(tenantId, companyId, [mes]),
    serieDeCaixa(tenantId, companyId, [mes]),
    paresDeLiquidacao(tenantId, companyId, mes),
  ]);
  // A linha final muda de nome conforme o regime; lado a lado, os dois nomes.
  const rotulo = (code: string, original: string) =>
    code === LINHA_OPERACIONAL
      ? "Resultado operacional × Gerador de caixa"
      : code === LINHA_DE_RESULTADO
        ? "Resultado do período × Fluxo de caixa livre"
        : rotuloEconomico(code, original);
  const linhas = compararResultados(econ.get(mes)!.resultado, caixa.get(mes)!, LINHAS_PRINCIPAIS, rotulo);
  const atrasoReceber = atrasoMedioEmDias(pares.RECEBER);
  const atrasoPagar = atrasoMedioEmDias(pares.PAGAR);

  return (
    <>
      <TabelaComparada linhas={linhas} rotuloA="Competência" rotuloB="Caixa" destacarAcima={0.15} />
      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <Card className="p-4">
          <p className="text-[12px] text-fg-muted">Atraso médio de recebimento</p>
          <p className="text-[20px] font-semibold tabular-nums mt-1">{dias(atrasoReceber)}</p>
          <p className="text-[11px] text-fg-muted mt-1">
            Dias entre o vencimento e o recebimento, nos {pares.RECEBER.length} títulos recebidos no mês. Positivo é atraso.
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-fg-muted">Atraso médio de pagamento</p>
          <p className="text-[20px] font-semibold tabular-nums mt-1">{dias(atrasoPagar)}</p>
          <p className="text-[11px] text-fg-muted mt-1">
            Dias entre o vencimento e o pagamento, nos {pares.PAGAR.length} títulos pagos no mês.
          </p>
        </Card>
      </div>
      <NotaDeFonte>
        Variação de 15% ou mais aparece destacada — em geral é prazo de recebimento ou pagamento, não erro de lançamento.
        O caixa desta comparação usa só lançamentos do Connect; um mês importado do Omie na DRE de caixa pode mostrar
        outro número lá.
      </NotaDeFonte>
    </>
  );
}

// ─── Reconciliação ──────────────────────────────────────────────────────────

export async function AbaReconciliacao({ tenantId, companyId, mes }: Base) {
  const { conjuntos, mapeamento } = await dadosDaReconciliacao(tenantId, companyId, mes);
  const passos = reconciliarLucroCaixa(conjuntos, mapeamento);
  const maior = Math.max(1, ...passos.map((p) => Math.abs(p.centavos)));

  return (
    <>
      <div className="overflow-x-auto border border-border rounded-lg bg-surface">
        <table className="w-full min-w-[600px] text-[13px]">
          <thead>
            <tr className={CABECALHO}>
              <th className={`${TH} pl-4`}>Passo</th>
              <th className={`${TH} text-right`}>Valor</th>
              <th className={`${TH} pr-4 hidden sm:table-cell w-[30%]`}></th>
            </tr>
          </thead>
          <tbody>
            {passos.map((p) => (
              <tr key={p.code} className={`border-b border-border-soft ${p.tipo === "total" ? "bg-surface-hover font-medium" : ""}`}>
                <td className={`py-2 pl-4 pr-3 ${p.tipo === "total" ? "text-fg" : "text-fg-secondary"}`}>{p.label}</td>
                <td className={`py-2 pr-3 text-right tabular-nums whitespace-nowrap ${p.centavos < 0 ? "text-danger" : ""}`}>{moeda(p.centavos)}</td>
                <td className="py-2 pr-4 hidden sm:table-cell">
                  <div className="h-2.5 w-full rounded bg-border-soft overflow-hidden">
                    <div
                      className={`h-full ${p.centavos < 0 ? "bg-danger" : "bg-success"}`}
                      style={{ width: `${(Math.abs(p.centavos) / maior) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NotaDeFonte>
        A ponte fecha no centavo, sem &ldquo;ajuste de timing&rdquo;: cada lançamento cai em exatamente um grupo — competência
        e caixa no mês, só competência, ou só caixa. {conjuntos.soCompetencia.length} lançamentos do mês não liquidados no
        mês e {conjuntos.soCaixa.length} liquidados no mês de outras competências. Só lançamentos do Connect, sem o import do
        Omie.
      </NotaDeFonte>
    </>
  );
}

// ─── Comparativos ───────────────────────────────────────────────────────────

const MODOS = [
  { chave: "mes_anterior", rotulo: "Mês × mês anterior" },
  { chave: "ano_anterior", rotulo: "Mês × mesmo mês do ano anterior" },
  { chave: "acumulado", rotulo: "Acumulado × acumulado do ano anterior" },
  { chave: "empresa", rotulo: "Empresa × empresa" },
] as const;

export async function AbaComparativos({
  tenantId,
  companyId,
  mes,
  modo: modoBruto,
  regime: regimeBruto,
  empresa2,
  empresas,
}: Base & { modo?: string; regime?: string; empresa2?: string; empresas: { id: string; nome: string }[] }) {
  const modo = MODOS.find((m) => m.chave === modoBruto)?.chave ?? "mes_anterior";
  const regime = regimeBruto === "caixa" ? "caixa" : "competencia";
  const outras = empresas.filter((e) => e.id !== companyId);
  const outra = outras.find((e) => e.id === empresa2) ?? outras[0];

  let rotuloA = rotuloDaCompetencia(mes);
  let rotuloB = "";
  let atual;
  let comparado;

  if (modo === "empresa") {
    if (!outra) return <EmptyState title="Não há outra empresa para comparar" />;
    rotuloA = empresas.find((e) => e.id === companyId)?.nome ?? "Empresa";
    rotuloB = outra.nome;
    [atual, comparado] = await Promise.all([
      resultadoDoPeriodo(tenantId, companyId, [mes], regime),
      resultadoDoPeriodo(tenantId, outra.id, [mes], regime),
    ]);
  } else {
    const periodoA = modo === "acumulado" ? acumuladoDoAno(mes) : [mes];
    const periodoB =
      modo === "mes_anterior"
        ? [somarMeses(mes, -1)]
        : modo === "ano_anterior"
          ? [somarMeses(mes, -12)]
          : acumuladoDoAno(somarMeses(mes, -12));
    const nome = (p: string[]) => (p.length === 1 ? rotuloDaCompetencia(p[0]!) : `${rotuloDaCompetencia(p[0]!)} a ${rotuloDaCompetencia(p.at(-1)!)}`);
    rotuloA = nome(periodoA);
    rotuloB = nome(periodoB);
    [atual, comparado] = await Promise.all([
      resultadoDoPeriodo(tenantId, companyId, periodoA, regime),
      resultadoDoPeriodo(tenantId, companyId, periodoB, regime),
    ]);
  }

  const linhas = compararResultados(atual, comparado, undefined, regime === "competencia" ? rotuloEconomico : undefined);

  return (
    <>
      <form method="get" action="/dre/analises" className="flex flex-wrap items-center gap-2 mb-4">
        <input type="hidden" name="aba" value="comparativos" />
        <input type="hidden" name="empresa" value={companyId} />
        <input type="hidden" name="mes" value={mes} />
        <Select compact name="modo" defaultValue={modo} className="w-80 max-w-full" aria-label="Modo">
          {MODOS.map((m) => (
            <option key={m.chave} value={m.chave}>
              {m.rotulo}
            </option>
          ))}
        </Select>
        <Select compact name="regime" defaultValue={regime} className="w-44" aria-label="Regime">
          <option value="competencia">Competência</option>
          <option value="caixa">Caixa</option>
        </Select>
        {modo === "empresa" && outra && (
          <Select compact name="empresa2" defaultValue={outra.id} className="w-72 max-w-full" aria-label="Comparar com">
            {outras.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" variant="secondary" size="sm">
          Comparar
        </Button>
      </form>
      <TabelaComparada linhas={linhas} rotuloA={rotuloA} rotuloB={rotuloB} />
      <NotaDeFonte>
        Variação sobre o valor absoluto do comparado: despesa que vai de −100 para −150 aparece como −50%, piora.
        {regime === "caixa" && " Caixa só com lançamentos do Connect, sem o import do Omie."}
        {" "}Realizado × orçamento e × forecast salvo dependem do motor de orçamento, fora desta etapa.
      </NotaDeFonte>
    </>
  );
}

// ─── Forecast ───────────────────────────────────────────────────────────────

export async function AbaForecast({ tenantId, companyId, mes, metodo: metodoBruto }: Base & { metodo?: string }) {
  const metodo: MetodoDeProjecao = METODOS_DE_PROJECAO.find((m) => m.chave === metodoBruto)?.chave ?? "tendencia";
  const janela = competenciasAte(mes, 12);
  const futuros = Array.from({ length: 6 }, (_, i) => somarMeses(mes, i + 1));
  const [serie, titulos] = await Promise.all([
    serieEconomica(tenantId, companyId, janela),
    titulosEmAberto({ tenantId, companyIds: [companyId] }),
  ]);

  // O histórico começa no primeiro mês com lançamento. Zeros de antes de a
  // empresa existir no Connect puxariam a tendência para cima sem motivo.
  const inicio = janela.findIndex((c) => serie.get(c)!.lancamentos > 0);
  const historico = inicio < 0 ? [] : janela.slice(inicio);
  if (historico.length < 3) {
    return (
      <EmptyState
        title="Histórico curto demais para projetar"
        description={`São precisos ao menos três meses com lançamento por competência até ${rotuloDaCompetencia(mes)}; há ${historico.length}.`}
      />
    );
  }

  const mesesDoHistorico = historico.map((c) => partesDaCompetencia(c).mes);
  const mesesFuturos = futuros.map((c) => partesDaCompetencia(c).mes);
  const projetar = (code: string) =>
    projetarSerie(
      historico.map((c) => valorDaLinha(serie.get(c)!.resultado, code)),
      metodo,
      futuros.length,
      mesesDoHistorico,
      mesesFuturos
    );
  const receita = projetar("receita_bruta");
  const operacional = projetar(LINHA_OPERACIONAL);
  const resultado = projetar(LINHA_DE_RESULTADO);
  const abertos = abertosPorMes(titulos, futuros);

  return (
    <>
      <nav className="flex flex-wrap gap-1.5 mb-4">
        {METODOS_DE_PROJECAO.map((m) => (
          <Link
            key={m.chave}
            href={`/dre/analises?aba=forecast&empresa=${companyId}&mes=${mes}&metodo=${m.chave}`}
            aria-current={m.chave === metodo ? "page" : undefined}
            className={
              m.chave === metodo
                ? "h-8 px-3 inline-flex items-center rounded-md border border-border-strong text-fg text-[12px]"
                : "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-muted text-[12px] hover:bg-surface-hover"
            }
          >
            {m.rotulo}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto border border-border rounded-lg bg-surface">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className={CABECALHO}>
              <th className={`${TH} pl-4`}>Mês</th>
              <th className={`${TH} text-right`}>Receita bruta</th>
              <th className={`${TH} text-right`}>Resultado operacional</th>
              <th className={`${TH} text-right`}>Resultado do período</th>
              <th className={`${TH} pr-4 text-right`}>Títulos em aberto (líquido)</th>
            </tr>
          </thead>
          <tbody>
            {historico.slice(-3).map((c) => {
              const r = serie.get(c)!.resultado;
              return (
                <tr key={c} className="border-b border-border-soft text-fg-muted">
                  <td className="py-2 pl-4 pr-3">
                    {rotuloDaCompetencia(c)} <span className="text-[11px]">realizado</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(valorDaLinha(r, "receita_bruta"))}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(valorDaLinha(r, LINHA_OPERACIONAL))}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(valorDaLinha(r, LINHA_DE_RESULTADO))}</td>
                  <td className="py-2 pr-4 text-right">—</td>
                </tr>
              );
            })}
            {futuros.map((c, i) => (
              <tr key={c} className="border-b border-border-soft">
                <td className="py-2 pl-4 pr-3 font-medium">{rotuloDaCompetencia(c)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{moeda(receita[i]!)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${tomDoValor(operacional[i]!)}`}>{moeda(operacional[i]!)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${tomDoValor(resultado[i]!)}`}>{moeda(resultado[i]!)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{moeda(abertos.get(c)!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NotaDeFonte>
        Projeção determinística sobre {historico.length} meses de competência, sem IA. A última coluna não é projeção: é o
        que já está lançado vencendo em cada mês (a receber menos a pagar). Sazonalidade com menos de dois anos de histórico
        pesa um ano só e tende a exagerar o mês atípico. Forecast manual, versionado e aprovado é motor de orçamento, fora
        desta etapa.
      </NotaDeFonte>
    </>
  );
}

// ─── Cenários ───────────────────────────────────────────────────────────────

export async function AbaCenarios({ tenantId, companyId, mes }: Base) {
  const serie = await serieEconomica(tenantId, companyId, [mes]);
  const dre = serie.get(mes)!;
  if (dre.lancamentos === 0) {
    return <EmptyState title={`Sem lançamentos com competência em ${rotuloDaCompetencia(mes)}`} description="O cenário parte de um mês real." />;
  }
  return (
    <>
      <SimuladorDeCenarios porGrupo={dre.resultado.porGrupo} />
      <NotaDeFonte>
        Simulação sobre a DRE econômica de {rotuloDaCompetencia(mes)}, calculada no navegador e não gravada. O variável da
        margem de contribuição acompanha a receita; investimentos e não operacionais ficam constantes.
      </NotaDeFonte>
    </>
  );
}

// ─── Indicadores ────────────────────────────────────────────────────────────

const CATEGORIAS: Indicador["categoria"][] = ["Rentabilidade", "Capital de giro", "Caixa", "Risco"];

function valorDoIndicador(i: Indicador): string {
  if (i.valor === null) return "—";
  if (i.formato === "moeda") return moeda(i.valor);
  if (i.formato === "percentual") return percentual(i.valor);
  return dias(i.valor);
}

export async function AbaIndicadores({ tenantId, companyId, mes }: Base) {
  const escopo = { tenantId, companyIds: [companyId] };
  const ultimos = competenciasAte(mes, 3);
  const [serie, titulos, movimentos] = await Promise.all([
    serieEconomica(tenantId, companyId, [mes]),
    titulosEmAberto(escopo),
    movimentosRealizados(escopo, ultimos),
  ]);
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const receber = titulos.filter((t) => t.kind === "RECEBER");
  const soma = (l: { centavos: number }[]) => l.reduce((n, t) => n + t.centavos, 0);
  const ranking = rankingDeContrapartes(
    receber.map((t) => ({
      situacao: t.vencimentoKey < hojeKey ? ("VENCIDA" as const) : ("A_VENCER" as const),
      valorCentavos: t.centavos,
      vencimentoKey: t.vencimentoKey,
      contraparteNome: t.contraparteNome,
    })),
    1
  );

  const indicadores = calcularIndicadores({
    economico: serie.get(mes)!.resultado,
    diasNoMes: diasNoMes(mes),
    aReceberEmAberto: soma(receber),
    aReceberVencido: soma(receber.filter((t) => t.vencimentoKey < hojeKey)),
    aPagarEmAberto: soma(titulos.filter((t) => t.kind === "PAGAR")),
    variacoesDeCaixa: fluxoRealizado(movimentos, ultimos).map((m) => m.saldoDoMes),
    maiorClienteEmAberto: ranking[0]?.emAberto ?? 0,
  });

  return (
    <>
      {CATEGORIAS.map((cat) => (
        <section key={cat} className="mb-5">
          <h3 className="text-[13px] font-semibold text-fg mb-2">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {indicadores
              .filter((i) => i.categoria === cat)
              .map((i) => (
                <Card key={i.codigo} className="p-3.5 flex flex-col gap-1">
                  <p className="text-[12px] text-fg-muted">{i.rotulo}</p>
                  <p className={`text-[19px] font-semibold tabular-nums ${i.valor === null ? "text-fg-muted" : ""}`}>{valorDoIndicador(i)}</p>
                  <p className="text-[11px] text-fg-muted font-mono">{i.formula}</p>
                  <p className="text-[11px] text-fg-muted">{i.leitura}</p>
                  {i.motivo && <p className="text-[11px] italic text-warning">{i.motivo}</p>}
                </Card>
              ))}
          </div>
        </section>
      ))}
      <NotaDeFonte>
        Rentabilidade pela competência de {rotuloDaCompetencia(mes)}. Prazos, capital de giro e risco pela posição em aberto
        de hoje. Endividamento, ROE e estoque dependem de balanço, que o Connect não tem.
      </NotaDeFonte>
    </>
  );
}

// ─── CFO ────────────────────────────────────────────────────────────────────

const COR_DA_PRIORIDADE = { Alta: "danger", Média: "warning", Baixa: "success" } as const;

export async function AbaCfo({ tenantId, companyId, mes, pergunta }: Base & { pergunta?: string }) {
  const chave = PERGUNTAS_DO_CFO.find((p) => p.chave === pergunta)?.chave as ChaveDaPergunta | undefined;
  const href = (p: string) => `/dre/analises?aba=cfo&empresa=${companyId}&mes=${mes}&pergunta=${p}`;

  let resposta = null;
  if (chave) {
    const anterior = somarMeses(mes, -1);
    const [serie, reconciliacao, titulos] = await Promise.all([
      serieEconomica(tenantId, companyId, [anterior, mes]),
      dadosDaReconciliacao(tenantId, companyId, mes),
      titulosEmAberto({ tenantId, companyIds: [companyId] }),
    ]);
    const hojeKey = saoPauloParts(new Date()).dateKey;
    const projecao = projecaoPorJanela(titulos, hojeKey, [60]);
    const receber = titulos.filter((t) => t.kind === "RECEBER");
    const ranking = rankingDeContrapartes(
      receber.map((t) => ({
        situacao: t.vencimentoKey < hojeKey ? ("VENCIDA" as const) : ("A_VENCER" as const),
        valorCentavos: t.centavos,
        vencimentoKey: t.vencimentoKey,
        contraparteNome: t.contraparteNome,
      })),
      10
    );
    resposta = responderAoCfo(chave, {
      competencia: mes,
      atual: serie.get(mes)!.resultado,
      anterior: serie.get(anterior)!.resultado,
      reconciliacao: reconciliarLucroCaixa(reconciliacao.conjuntos, reconciliacao.mapeamento),
      proximos60: projecao.janelas[0]!,
      vencidos: projecao.vencidos,
      aReceber: ranking.map((r) => ({ nome: r.contraparteNome, emAberto: r.emAberto, vencido: r.vencido })),
      aReceberTotal: receber.reduce((n, t) => n + t.centavos, 0),
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {PERGUNTAS_DO_CFO.map((p) => (
          <Link
            key={p.chave}
            href={href(p.chave)}
            aria-current={p.chave === chave ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              p.chave === chave ? "border-brand/40 bg-brand/8 text-brand" : "border-border text-fg-secondary hover:bg-surface-hover"
            }`}
          >
            {p.rotulo}
          </Link>
        ))}
      </div>

      {!resposta && <p className="text-[13px] text-fg-muted">Escolha uma pergunta para ver o diagnóstico de {rotuloDaCompetencia(mes)}.</p>}

      {resposta && (
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-fg">{resposta.titulo}</h3>
            <Badge variant={COR_DA_PRIORIDADE[resposta.prioridade]}>Prioridade {resposta.prioridade.toLowerCase()}</Badge>
          </div>
          <Secao titulo="Diagnóstico" texto={resposta.diagnostico} />
          {resposta.evidencias.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1">Evidências</p>
              <ul className="flex flex-col gap-0.5 text-[13px] text-fg-secondary">
                {resposta.evidencias.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Secao titulo="Causa provável" texto={resposta.causaProvavel} />
            <Secao titulo="Impacto" texto={resposta.impacto} />
            <Secao titulo="Recomendação" texto={resposta.recomendacao} />
          </div>
          {resposta.planoDeAcao.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1">Plano de ação</p>
              <ol className="list-decimal pl-5 text-[13px] flex flex-col gap-0.5">
                {resposta.planoDeAcao.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </div>
          )}
          <Link href={resposta.origem.href.includes("empresa=") ? resposta.origem.href : `${resposta.origem.href}${resposta.origem.href.includes("?") ? "&" : "?"}empresa=${companyId}`} className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline">
            Ver de onde vem: {resposta.origem.rotulo} <ArrowRight size={13} />
          </Link>
        </Card>
      )}

      <NotaDeFonte>
        Perguntas fixas, com resposta calculada sobre os dados do mês — nenhuma chamada a IA externa, e nada é alterado.
        Toda frase sai de um número que a tela de origem mostra.
      </NotaDeFonte>
    </>
  );
}

function Secao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-fg-muted">{titulo}</p>
      <p className="text-[13px] text-fg">{texto}</p>
    </div>
  );
}
