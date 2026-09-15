// Relatórios do Societário — SLA, voltas, produtividade e custo em taxas.
//
// Tudo aqui é conta sobre linhas já lidas: quem tem banco é quem busca
// (`painel-data.ts`), e a regra de prazo continua sendo `prazoDoProcesso`. Um
// relatório que recalculasse "estourado" do seu jeito discordaria da fila na
// primeira linha que alguém fosse conferir.

import { custoEmTaxas, type TaxaParaTotal } from "./licencas";
import type { Prazo } from "./processo";

// ─── Período ─────────────────────────────────────────────────────────────────

export const PERIODOS = [
  { chave: "30", dias: 30, rotulo: "30 dias" },
  { chave: "90", dias: 90, rotulo: "90 dias" },
  { chave: "365", dias: 365, rotulo: "12 meses" },
] as const;

export type Periodo = (typeof PERIODOS)[number];

/** Parâmetro da URL; desconhecido cai em 90 dias, que cobre um trimestre. */
export function lerPeriodo(valor: unknown): Periodo {
  return PERIODOS.find((p) => p.chave === valor) ?? PERIODOS[1];
}

export function inicioDoPeriodo(periodo: Periodo, agora: Date): Date {
  return new Date(agora.getTime() - periodo.dias * 86_400_000);
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

export type ProcessoParaRelatorio = {
  id: string;
  tipoId: string;
  tipoNome: string;
  empresaNome: string;
  responsavelId: string | null;
  responsavelNome: string | null;
  /** Dias úteis consumidos até agora, ou até a conclusão. */
  prazo: Prazo;
  voltas: number;
  concluidoEm: Date | null;
  taxas: TaxaParaTotal[];
};

/** Média com uma casa, ou nulo sem amostra — "0" seria afirmar que foi instantâneo. */
function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const soma = valores.reduce((s, v) => s + v, 0);
  return Math.round((soma / valores.length) * 10) / 10;
}

// ─── SLA por tipo ────────────────────────────────────────────────────────────

export type LinhaDeSla = {
  tipoId: string;
  tipoNome: string;
  previstoMin: number | null;
  previstoMax: number | null;
  total: number;
  concluidos: number;
  dentro: number;
  noLimite: number;
  estourados: number;
  semPrevisao: number;
  mediaDeDias: number | null;
  mediaDeVoltas: number | null;
};

/**
 * Previsto contra realizado, por tipo.
 *
 * Por tipo, e não um número geral: 7 dias é folga na Alteração e estouro na
 * Constituição, e a média misturando os dois não diz nada a nenhum dos dois.
 * As voltas ficam na mesma linha porque são a causa do estouro — o prazo sem
 * elas é um número sem explicação.
 */
export function slaPorTipo(processos: ProcessoParaRelatorio[]): LinhaDeSla[] {
  const porTipo = new Map<string, ProcessoParaRelatorio[]>();
  for (const p of processos) {
    const lista = porTipo.get(p.tipoId) ?? [];
    lista.push(p);
    porTipo.set(p.tipoId, lista);
  }

  return [...porTipo.values()]
    .map((lista) => {
      const primeiro = lista[0];
      const conta = (s: Prazo["situacao"]) => lista.filter((p) => p.prazo.situacao === s).length;
      return {
        tipoId: primeiro.tipoId,
        tipoNome: primeiro.tipoNome,
        previstoMin: primeiro.prazo.previstoMin,
        previstoMax: primeiro.prazo.previstoMax,
        total: lista.length,
        concluidos: lista.filter((p) => p.concluidoEm !== null).length,
        dentro: conta("dentro"),
        noLimite: conta("no_limite"),
        estourados: conta("estourado"),
        semPrevisao: conta("sem_previsao"),
        mediaDeDias: media(lista.map((p) => p.prazo.dias)),
        mediaDeVoltas: media(lista.map((p) => p.voltas)),
      };
    })
    .sort((a, b) => a.tipoNome.localeCompare(b.tipoNome, "pt-BR"));
}

// ─── Voltas ──────────────────────────────────────────────────────────────────

export type ResumoDeVoltas = {
  processos: number;
  comVolta: number;
  totalDeVoltas: number;
  /** Inteiro de 0 a 100, ou nulo sem processo. */
  percentualComVolta: number | null;
};

export function resumoDeVoltas(processos: ProcessoParaRelatorio[]): ResumoDeVoltas {
  const comVolta = processos.filter((p) => p.voltas > 0).length;
  return {
    processos: processos.length,
    comVolta,
    totalDeVoltas: processos.reduce((s, p) => s + p.voltas, 0),
    percentualComVolta: processos.length === 0 ? null : Math.round((comVolta / processos.length) * 100),
  };
}

/** Os que mais voltaram — é por eles que a conversa com o cliente começa. */
export function processosComMaisVoltas(
  processos: ProcessoParaRelatorio[],
  limite = 10
): ProcessoParaRelatorio[] {
  return processos
    .filter((p) => p.voltas > 0)
    .sort((a, b) => b.voltas - a.voltas || b.prazo.dias - a.prazo.dias)
    .slice(0, limite);
}

// ─── Produtividade ───────────────────────────────────────────────────────────

export type LinhaDeProdutividade = {
  /** Nulo agrupa os processos ainda não distribuídos. */
  responsavelId: string | null;
  nome: string;
  abertos: number;
  estouradosAbertos: number;
  concluidosNoPeriodo: number;
  mediaDeDiasDosConcluidos: number | null;
  voltasDosConcluidos: number;
};

/**
 * Concluídos no período por responsável, ao lado da carteira aberta de cada um.
 *
 * O número de concluídos sozinho premia quem pegou só Baixa, que tem 5 dias;
 * por isso a linha traz também a média de dias e as voltas do que foi
 * concluído, e o que está aberto e estourado na mão da pessoa agora.
 *
 * O responsável é o **atual** do processo: não há histórico de redistribuição,
 * então quem assumiu no fim leva o crédito do processo inteiro.
 */
export function produtividadePorResponsavel(
  processos: ProcessoParaRelatorio[],
  inicio: Date,
  fim: Date
): LinhaDeProdutividade[] {
  const porPessoa = new Map<string, LinhaDeProdutividade & { dias: number[] }>();

  for (const p of processos) {
    const chave = p.responsavelId ?? "";
    const linha =
      porPessoa.get(chave) ??
      {
        responsavelId: p.responsavelId,
        nome: p.responsavelNome ?? "Sem responsável",
        abertos: 0,
        estouradosAbertos: 0,
        concluidosNoPeriodo: 0,
        mediaDeDiasDosConcluidos: null,
        voltasDosConcluidos: 0,
        dias: [],
      };

    if (p.concluidoEm === null) {
      linha.abertos += 1;
      if (p.prazo.situacao === "estourado") linha.estouradosAbertos += 1;
    } else if (p.concluidoEm >= inicio && p.concluidoEm <= fim) {
      linha.concluidosNoPeriodo += 1;
      linha.voltasDosConcluidos += p.voltas;
      linha.dias.push(p.prazo.dias);
    } else {
      // Concluído fora do período: não conta para ninguém, e não cria linha.
      continue;
    }
    porPessoa.set(chave, linha);
  }

  return [...porPessoa.values()]
    .map(({ dias, ...linha }) => ({ ...linha, mediaDeDiasDosConcluidos: media(dias) }))
    .sort(
      (a, b) =>
        // "Sem responsável" vai para o fim: não é uma pessoa para comparar.
        Number(a.responsavelId === null) - Number(b.responsavelId === null) ||
        b.concluidosNoPeriodo - a.concluidosNoPeriodo ||
        a.nome.localeCompare(b.nome, "pt-BR")
    );
}

// ─── Custo em taxas ──────────────────────────────────────────────────────────

export type LinhaDeCusto = {
  id: string;
  tipoNome: string;
  empresaNome: string;
  voltas: number;
  totalCentavos: number;
  pagoCentavos: number;
  custoDasVoltasCentavos: number;
};

/**
 * Quanto cada processo custou em taxas, do mais caro para o mais barato.
 *
 * Processo sem taxa não entra: a lista existe para achar onde o dinheiro foi,
 * e cem linhas de R$ 0,00 esconderiam as três que importam.
 */
export function custoPorProcesso(processos: ProcessoParaRelatorio[]): LinhaDeCusto[] {
  return processos
    .filter((p) => p.taxas.length > 0)
    .map((p) => ({
      id: p.id,
      tipoNome: p.tipoNome,
      empresaNome: p.empresaNome,
      voltas: p.voltas,
      ...custoEmTaxas(p.taxas),
    }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos || b.custoDasVoltasCentavos - a.custoDasVoltasCentavos);
}

export function totaisDeCusto(linhas: LinhaDeCusto[]): {
  totalCentavos: number;
  pagoCentavos: number;
  custoDasVoltasCentavos: number;
} {
  return linhas.reduce(
    (s, l) => ({
      totalCentavos: s.totalCentavos + l.totalCentavos,
      pagoCentavos: s.pagoCentavos + l.pagoCentavos,
      custoDasVoltasCentavos: s.custoDasVoltasCentavos + l.custoDasVoltasCentavos,
    }),
    { totalCentavos: 0, pagoCentavos: 0, custoDasVoltasCentavos: 0 }
  );
}
