// CFO — diagnóstico por perguntas fixas, com resposta **calculada**.
//
// ─── Sem IA externa, de propósito ────────────────────────────────────────────
//
// O nome do protótipo era "CFO IA", e ele já não chamava modelo nenhum: cada
// pergunta é uma conta sobre a DRE e as contas em aberto, e cada frase da
// resposta sai de um número que a tela consegue mostrar de onde veio. Uma
// resposta generativa sobre dinheiro de cliente teria de ser conferida por
// alguém antes de valer — e aí já não economiza nada.
//
// Função pura: recebe tudo pronto e só redige.

import { GRUPOS } from "./estrutura";
import type { ResultadoDoDre } from "./calculo";
import type { PassoDaReconciliacao } from "./analises";
import { LINHA_DE_RESULTADO, LINHA_OPERACIONAL, valorDaLinha, fracaoDaLinha } from "./economica";

export type ChaveDaPergunta =
  | "margem_caiu"
  | "lucro_x_caixa"
  | "despesa_cresceu"
  | "queda_operacional"
  | "caixa_60_dias"
  | "reduzir_despesas"
  | "cliente_risco";

export const PERGUNTAS_DO_CFO: { chave: ChaveDaPergunta; rotulo: string }[] = [
  { chave: "margem_caiu", rotulo: "Por que minha margem mudou este mês?" },
  { chave: "lucro_x_caixa", rotulo: "Qual a diferença entre meu resultado e meu caixa?" },
  { chave: "despesa_cresceu", rotulo: "Quais despesas mais cresceram?" },
  { chave: "queda_operacional", rotulo: "Quais linhas explicam a variação do resultado operacional?" },
  { chave: "caixa_60_dias", rotulo: "Os títulos dos próximos 60 dias fecham no positivo?" },
  { chave: "reduzir_despesas", rotulo: "Onde posso reduzir despesas?" },
  { chave: "cliente_risco", rotulo: "Quais clientes representam maior risco?" },
];

export type Prioridade = "Alta" | "Média" | "Baixa";

export type RespostaDoCfo = {
  titulo: string;
  diagnostico: string;
  evidencias: string[];
  causaProvavel: string;
  impacto: string;
  recomendacao: string;
  planoDeAcao: string[];
  prioridade: Prioridade;
  /** Rota do app onde o número se abre. */
  origem: { rotulo: string; href: string };
};

export type DadosDoCfo = {
  competencia: string;
  atual: ResultadoDoDre;
  anterior: ResultadoDoDre;
  reconciliacao: PassoDaReconciliacao[];
  /** Títulos em aberto vencendo de hoje a 60 dias. */
  proximos60: { entradas: number; saidas: number };
  /** Já vencidos e não baixados. */
  vencidos: { entradas: number; saidas: number };
  aReceber: { nome: string; emAberto: number; vencido: number }[];
  aReceberTotal: number;
};

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function moedaDoCfo(centavos: number): string {
  return MOEDA.format(centavos / 100);
}
function pct(f: number | null): string {
  return f === null ? "—" : PCT.format(f);
}

const DESPESAS = GRUPOS.filter((g) => g.origem === "pagamento");

type Variacao = { code: string; label: string; atual: number; anterior: number; delta: number };

/**
 * Como cada grupo de despesa se moveu. Delta **negativo é piora**: despesa
 * vem negativa na estrutura, então crescer é ficar mais negativa.
 */
function variacoesDeDespesa(atual: ResultadoDoDre, anterior: ResultadoDoDre): Variacao[] {
  return DESPESAS.map((g) => {
    const a = atual.porGrupo[g.code] ?? 0;
    const b = anterior.porGrupo[g.code] ?? 0;
    return { code: g.code, label: g.label, atual: a, anterior: b, delta: a - b };
  }).sort((x, y) => x.delta - y.delta);
}

export function responderAoCfo(pergunta: ChaveDaPergunta, d: DadosDoCfo): RespostaDoCfo {
  const titulo = PERGUNTAS_DO_CFO.find((p) => p.chave === pergunta)!.rotulo;
  const dre = { rotulo: "DRE econômica", href: `/dre/economica?mes=${d.competencia}` };
  const receita = valorDaLinha(d.atual, "receita_bruta");

  switch (pergunta) {
    case "margem_caiu": {
      const agora = fracaoDaLinha(d.atual, "margem_contribuicao_pct");
      const antes = fracaoDaLinha(d.anterior, "margem_contribuicao_pct");
      const piores = variacoesDeDespesa(d.atual, d.anterior).filter((v) => v.delta < 0);
      const caiu = agora !== null && antes !== null && agora < antes;
      const principal = piores[0];
      return {
        titulo,
        diagnostico:
          agora === null || antes === null
            ? "Sem receita num dos dois meses — a margem não é calculável para comparar."
            : caiu
              ? `A margem de contribuição caiu de ${pct(antes)} para ${pct(agora)}.`
              : `A margem de contribuição não caiu: foi de ${pct(antes)} para ${pct(agora)}.`,
        evidencias: [
          `Receita bruta: ${moedaDoCfo(valorDaLinha(d.anterior, "receita_bruta"))} → ${moedaDoCfo(receita)}`,
          ...piores.slice(0, 3).map((v) => `${v.label}: ${moedaDoCfo(v.anterior)} → ${moedaDoCfo(v.atual)}`),
        ],
        causaProvavel: principal
          ? `O grupo que mais piorou foi ${principal.label}, em ${moedaDoCfo(Math.abs(principal.delta))}.`
          : "Nenhum grupo de despesa piorou em relação ao mês anterior.",
        impacto: `Margem de contribuição: ${moedaDoCfo(valorDaLinha(d.anterior, "margem_contribuicao"))} → ${moedaDoCfo(valorDaLinha(d.atual, "margem_contribuicao"))}.`,
        recomendacao: principal ? `Abrir os lançamentos de ${principal.label} da competência.` : "Manter o acompanhamento mensal.",
        planoDeAcao: principal
          ? [`Listar os lançamentos de ${principal.label} do mês`, "Separar o que é pontual do que é recorrente", "Rever o preço se o custo variável subiu de vez"]
          : ["Registrar o que sustentou a margem", "Acompanhar o próximo fechamento"],
        prioridade: caiu && agora! < antes! - 0.05 ? "Alta" : caiu ? "Média" : "Baixa",
        origem: dre,
      };
    }

    case "lucro_x_caixa": {
      const econ = d.reconciliacao.find((p) => p.code === "resultado_economico")?.centavos ?? 0;
      const caixa = d.reconciliacao.find((p) => p.code === "variacao_de_caixa")?.centavos ?? 0;
      const ajustes = d.reconciliacao.filter((p) => p.tipo === "ajuste" && p.centavos !== 0);
      const maior = [...ajustes].sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos))[0];
      const gap = caixa - econ;
      return {
        titulo,
        diagnostico: `Resultado por competência de ${moedaDoCfo(econ)} e variação de caixa de ${moedaDoCfo(caixa)} — diferença de ${moedaDoCfo(gap)}.`,
        evidencias: ajustes.map((p) => `${p.label}: ${moedaDoCfo(p.centavos)}`),
        causaProvavel: maior ? `O maior item da ponte é "${maior.label}".` : "Competência e caixa coincidiram neste mês.",
        impacto: "Não muda o resultado — é a diferença entre quando a receita e a despesa pertencem ao mês e quando o dinheiro andou.",
        recomendacao: "Abrir a reconciliação para ver cada passo da ponte.",
        planoDeAcao: ["Abrir a reconciliação lucro → caixa", "Conferir as receitas do mês ainda não recebidas", "Conferir o que foi pago de outras competências"],
        prioridade: econ !== 0 && Math.abs(gap) > Math.abs(econ) * 0.5 ? "Alta" : "Média",
        origem: { rotulo: "Reconciliação", href: `/dre/analises?aba=reconciliacao&mes=${d.competencia}` },
      };
    }

    case "despesa_cresceu": {
      const piores = variacoesDeDespesa(d.atual, d.anterior).filter((v) => v.delta < 0);
      const principal = piores[0];
      return {
        titulo,
        diagnostico: principal
          ? `${principal.label} foi o que mais cresceu: ${moedaDoCfo(Math.abs(principal.delta))} a mais que no mês anterior.`
          : "Nenhum grupo de despesa cresceu em relação ao mês anterior.",
        evidencias: piores.slice(0, 4).map((v) => `${v.label}: ${moedaDoCfo(v.anterior)} → ${moedaDoCfo(v.atual)}`),
        causaProvavel: principal ? "Veja os lançamentos do grupo para separar contrato novo de gasto pontual." : "—",
        impacto: principal
          ? `Tudo o mais constante, ${moedaDoCfo(Math.abs(principal.delta))} a menos no resultado do mês.`
          : "Sem impacto negativo de despesa.",
        recomendacao: principal ? `Revisar ${principal.label}.` : "Manter o acompanhamento.",
        planoDeAcao: principal
          ? [`Abrir os lançamentos de ${principal.label}`, "Identificar o que é novo ou fora do padrão", "Definir contenção se for recorrente"]
          : ["Acompanhar o próximo fechamento"],
        prioridade: principal && receita > 0 && Math.abs(principal.delta) > receita * 0.03 ? "Alta" : principal ? "Média" : "Baixa",
        origem: { rotulo: "Comparativos", href: `/dre/analises?aba=comparativos&mes=${d.competencia}` },
      };
    }

    case "queda_operacional": {
      const agora = valorDaLinha(d.atual, LINHA_OPERACIONAL);
      const antes = valorDaLinha(d.anterior, LINHA_OPERACIONAL);
      const delta = agora - antes;
      const movimentos = [
        { label: "Receita bruta", delta: receita - valorDaLinha(d.anterior, "receita_bruta") },
        ...variacoesDeDespesa(d.atual, d.anterior)
          .filter((v) => !["investimentos", "outras_despesas"].includes(v.code))
          .map((v) => ({ label: v.label, delta: v.delta })),
      ].sort((a, b) => a.delta - b.delta);
      return {
        titulo,
        diagnostico:
          delta >= 0
            ? `O resultado operacional não caiu: melhorou ${moedaDoCfo(delta)} sobre o mês anterior.`
            : `O resultado operacional caiu ${moedaDoCfo(Math.abs(delta))} sobre o mês anterior.`,
        evidencias: movimentos.slice(0, 4).map((m) => `${m.label}: ${moedaDoCfo(m.delta)}`),
        causaProvavel: delta < 0 ? `Maior contribuição negativa: ${movimentos[0]!.label}.` : "Sem queda a explicar.",
        impacto: `Resultado operacional: ${moedaDoCfo(antes)} → ${moedaDoCfo(agora)}.`,
        recomendacao: "Usar os comparativos, mês contra mês anterior, para abrir linha a linha.",
        planoDeAcao: ["Abrir os comparativos", "Focar nas duas ou três linhas de maior variação negativa", "Definir meta de correção"],
        prioridade: delta < 0 && antes !== 0 && Math.abs(delta) > Math.abs(antes) * 0.2 ? "Alta" : delta < 0 ? "Média" : "Baixa",
        origem: { rotulo: "Comparativos", href: `/dre/analises?aba=comparativos&mes=${d.competencia}` },
      };
    }

    case "caixa_60_dias": {
      const saldo = d.proximos60.entradas - d.proximos60.saidas;
      const positivo = saldo >= 0;
      return {
        titulo,
        diagnostico: positivo
          ? `Sim: os títulos que vencem em 60 dias somam ${moedaDoCfo(saldo)} a favor.`
          : `Não: os títulos que vencem em 60 dias somam ${moedaDoCfo(saldo)} contra.`,
        evidencias: [
          `A receber em 60 dias: ${moedaDoCfo(d.proximos60.entradas)}`,
          `A pagar em 60 dias: ${moedaDoCfo(d.proximos60.saidas)}`,
          `Já vencido e não baixado: ${moedaDoCfo(d.vencidos.entradas)} a receber e ${moedaDoCfo(d.vencidos.saidas)} a pagar`,
        ],
        causaProvavel: positivo ? "—" : "O compromissado a pagar supera o que já está lançado a receber.",
        impacto:
          "Só o que já está lançado. Sem saldo bancário no Connect (chega com a conciliação), isto diz se os títulos fecham, não se o caixa aguenta.",
        recomendacao: positivo ? "Nenhuma ação urgente." : "Renegociar os maiores vencimentos a pagar e cobrar o vencido a receber.",
        planoDeAcao: positivo
          ? ["Acompanhar a projeção semanalmente"]
          : ["Abrir contas a pagar e ordenar os maiores vencimentos", "Cobrar o vencido a receber", "Avaliar antecipação de recebíveis"],
        prioridade: positivo ? "Baixa" : "Alta",
        origem: { rotulo: "Fluxo de caixa", href: "/fluxo-de-caixa" },
      };
    }

    case "reduzir_despesas": {
      const ranking = DESPESAS.map((g) => ({ label: g.label, valor: Math.abs(d.atual.porGrupo[g.code] ?? 0) }))
        .filter((r) => r.valor > 0)
        .sort((a, b) => b.valor - a.valor);
      const maior = ranking[0];
      return {
        titulo,
        diagnostico: maior
          ? `O maior grupo de despesa é ${maior.label}, com ${moedaDoCfo(maior.valor)}${receita > 0 ? ` (${pct(maior.valor / receita)} da receita)` : ""}.`
          : "Nenhuma despesa reconhecida na competência.",
        evidencias: ranking.slice(0, 4).map((r) => `${r.label}: ${moedaDoCfo(r.valor)}${receita > 0 ? ` (${pct(r.valor / receita)})` : ""}`),
        causaProvavel: "Concentração de custo não é problema por si — é onde um corte pequeno rende mais em valor.",
        impacto: maior ? `Cada 10% a menos em ${maior.label} são ${moedaDoCfo(Math.round(maior.valor * 0.1))} a mais no resultado.` : "—",
        recomendacao: maior ? `Começar pela revisão de ${maior.label}.` : "—",
        planoDeAcao: maior ? [`Detalhar os lançamentos de ${maior.label}`, "Cotar alternativas ou renegociar contratos", "Simular o corte na aba Cenários"] : [],
        prioridade: "Média",
        origem: { rotulo: "Cenários", href: `/dre/analises?aba=cenarios&mes=${d.competencia}` },
      };
    }

    case "cliente_risco": {
      const maior = d.aReceber[0];
      const participacao = maior && d.aReceberTotal > 0 ? maior.emAberto / d.aReceberTotal : 0;
      const vencido = d.aReceber.reduce((n, c) => n + c.vencido, 0);
      return {
        titulo,
        diagnostico: maior
          ? `${maior.nome} concentra ${pct(participacao)} do a receber em aberto (${moedaDoCfo(maior.emAberto)}).`
          : "Nada em aberto a receber.",
        evidencias: [
          ...d.aReceber.slice(0, 3).map((c) => `${c.nome}: ${moedaDoCfo(c.emAberto)} em aberto, ${moedaDoCfo(c.vencido)} vencido`),
          `Vencido no total: ${moedaDoCfo(vencido)}`,
        ],
        causaProvavel: participacao >= 0.4 ? "Receita concentrada num cliente só." : "Concentração dentro do razoável.",
        impacto: maior ? `Se ${maior.nome} atrasar, ${moedaDoCfo(maior.emAberto)} deixam de entrar.` : "—",
        recomendacao: maior ? "Acompanhar de perto o histórico de pagamento dos maiores." : "—",
        planoDeAcao: maior ? ["Abrir a análise de contas a receber", "Rever o histórico do maior cliente", "Buscar diversificar a carteira"] : [],
        prioridade: participacao >= 0.4 || vencido > 0 ? "Alta" : "Média",
        origem: { rotulo: "Contas a receber", href: "/receber?aba=analise" },
      };
    }
  }
}

/** Resultado do período — atalho para a tela resumir antes das perguntas. */
export function resultadoDoPeriodo(r: ResultadoDoDre): number {
  return valorDaLinha(r, LINHA_DE_RESULTADO);
}
