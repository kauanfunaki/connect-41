// Prazos do Societário — a régua comum de Minha área, Agenda, Exigências e Kanban.
//
// Regra pura, sem banco. Toda contagem de dia é **dia de calendário em São
// Paulo** (`diasAte`), a mesma das licenças e do prazo combinado: uma tela que
// dissesse "vence hoje" enquanto a outra diz "venceu ontem" faria o setor parar
// de confiar nas duas.

import { saoPauloParts, mondayOfWeek, firstOfMonth, addDaysToKey, addMonthsToKey } from "@/lib/agenda";
import { diasAte } from "./licencas";
import type { SituacaoDoProcesso } from "./processo";

// ─── Faixas de prazo ─────────────────────────────────────────────────────────

export type FaixaDePrazo = "vencido" | "hoje" | "semana" | "depois";

export const FAIXAS: FaixaDePrazo[] = ["vencido", "hoje", "semana", "depois"];

export const FAIXA_LABEL: Record<FaixaDePrazo, string> = {
  vencido: "Vencido",
  hoje: "Hoje",
  semana: "Próximos 7 dias",
  depois: "Depois",
};

/**
 * "Esta semana" são os **próximos 7 dias**, e não a semana do calendário: na
 * sexta, a semana civil acabaria em dois dias e o prazo de segunda cairia em
 * "depois" — justamente o que precisa ser preparado antes do fim de semana.
 */
export const DIAS_DA_SEMANA = 7;

export function faixaDoPrazo(data: Date, hoje: Date): FaixaDePrazo {
  const dias = diasAte(data, hoje);
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  if (dias <= DIAS_DA_SEMANA) return "semana";
  return "depois";
}

/** O prazo em palavras, do ponto de vista de hoje. */
export function textoDoPrazo(data: Date, hoje: Date): string {
  const dias = diasAte(data, hoje);
  if (dias < -1) return `venceu há ${-dias} dias`;
  if (dias === -1) return "venceu ontem";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `em ${dias} dias`;
}

/**
 * Separa os itens por faixa, cada faixa do prazo mais próximo ao mais distante.
 *
 * Dentro de "vencido" o mais antigo vem primeiro de propósito: é o que está
 * esperando há mais tempo, e ordenar pelo mais recente o empurraria para o fim.
 */
export function agruparPorFaixa<T>(
  itens: T[],
  dataDe: (item: T) => Date,
  hoje: Date
): Record<FaixaDePrazo, T[]> {
  const grupos: Record<FaixaDePrazo, T[]> = { vencido: [], hoje: [], semana: [], depois: [] };
  const ordenados = [...itens].sort((a, b) => dataDe(a).getTime() - dataDe(b).getTime());
  for (const item of ordenados) grupos[faixaDoPrazo(dataDe(item), hoje)].push(item);
  return grupos;
}

// ─── Itens de prazo ──────────────────────────────────────────────────────────

/**
 * De onde o prazo veio. Os quatro são réguas diferentes e a tela diz qual é:
 * o prazo do órgão numa exigência não se negocia, o prazo combinado com o
 * cliente sim.
 */
export type TipoDePrazo = "exigencia" | "taxa" | "licenca" | "processo";

export const TIPO_DE_PRAZO_LABEL: Record<TipoDePrazo, string> = {
  exigencia: "Exigência",
  taxa: "Taxa",
  licenca: "Licença",
  processo: "Prazo combinado",
};

export type ItemDePrazo = {
  /** Único entre tipos — o id de uma taxa e o de uma exigência podem colidir. */
  chave: string;
  tipo: TipoDePrazo;
  /** Nulo só em exigência sem prazo do órgão e processo sem prazo combinado. */
  data: Date | null;
  titulo: string;
  detalhe: string | null;
  empresaId: string;
  empresaNome: string;
  responsavelNome: string | null;
  href: string;
  valorCentavos: number | null;
};

// ─── Agenda ──────────────────────────────────────────────────────────────────

export type VisaoDaAgenda = "semana" | "mes";

export function lerVisaoDaAgenda(valor: unknown): VisaoDaAgenda {
  return valor === "mes" ? "mes" : "semana";
}

/** Quantas semanas (ou meses) a agenda olha para a frente. */
export const JANELA_DA_AGENDA: Record<VisaoDaAgenda, number> = { semana: 8, mes: 6 };

/**
 * O último dia civil que a agenda mostra, como chave "AAAA-MM-DD".
 *
 * Vai até o fim do último grupo, e não até hoje + N: cortar no meio de uma
 * semana mostraria uma semana incompleta como se estivesse vazia.
 */
export function ultimoDiaDaAgenda(visao: VisaoDaAgenda, hoje: Date): string {
  const chaveHoje = saoPauloParts(hoje).dateKey;
  if (visao === "semana") {
    return addDaysToKey(mondayOfWeek(chaveHoje), JANELA_DA_AGENDA.semana * 7 - 1);
  }
  return addDaysToKey(addMonthsToKey(firstOfMonth(chaveHoje), JANELA_DA_AGENDA.mes), -1);
}

/** O instante que fecha o dia civil em São Paulo — o `lte` da consulta. */
export function fimDoDia(chave: string): Date {
  return new Date(`${chave}T23:59:59.999-03:00`);
}

export type GrupoDaAgenda<T> = {
  /** "vencidos", ou a chave do primeiro dia do grupo (segunda-feira / dia 1º). */
  chave: string;
  vencido: boolean;
  itens: T[];
};

/**
 * A linha do tempo da agenda.
 *
 * O vencido sai do calendário e vai para um grupo só, no topo: espalhado pelas
 * semanas passadas, o prazo perdido há um mês ficaria abaixo da dobra, e é o
 * que mais pede ação. O resto agrupa por semana (a partir da segunda) ou por
 * mês, na ordem do tempo.
 */
export function agruparAgenda<T>(
  itens: T[],
  dataDe: (item: T) => Date,
  visao: VisaoDaAgenda,
  hoje: Date
): GrupoDaAgenda<T>[] {
  const ordenados = [...itens].sort((a, b) => dataDe(a).getTime() - dataDe(b).getTime());
  const vencidos: T[] = [];
  const porChave = new Map<string, T[]>();

  for (const item of ordenados) {
    const data = dataDe(item);
    if (diasAte(data, hoje) < 0) {
      vencidos.push(item);
      continue;
    }
    const dia = saoPauloParts(data).dateKey;
    const chave = visao === "semana" ? mondayOfWeek(dia) : firstOfMonth(dia);
    const lista = porChave.get(chave) ?? [];
    lista.push(item);
    porChave.set(chave, lista);
  }

  const grupos: GrupoDaAgenda<T>[] = [];
  if (vencidos.length > 0) grupos.push({ chave: "vencidos", vencido: true, itens: vencidos });
  for (const chave of [...porChave.keys()].sort()) {
    grupos.push({ chave, vencido: false, itens: porChave.get(chave)! });
  }
  return grupos;
}

// ─── Exigências ──────────────────────────────────────────────────────────────

export type ExigenciaParaOrdem = {
  dueAt: Date | null;
  raisedAt: Date;
  resolvedAt: Date | null;
};

/**
 * A ordem da lista de exigências.
 *
 * Aberta antes de resolvida. Entre as abertas, a de prazo do órgão mais próximo
 * no topo; as sem prazo vêm depois, da mais antiga para a mais nova — sem prazo
 * não é sem pressa, mas não dá para disputar posição com uma data. Resolvidas
 * da mais recente para trás, que é o histórico que alguém vem conferir.
 */
export function ordenarExigencias<T extends ExigenciaParaOrdem>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    const aAberta = a.resolvedAt === null;
    const bAberta = b.resolvedAt === null;
    if (aAberta !== bAberta) return aAberta ? -1 : 1;

    if (!aAberta) return b.resolvedAt!.getTime() - a.resolvedAt!.getTime();

    if ((a.dueAt === null) !== (b.dueAt === null)) return a.dueAt === null ? 1 : -1;
    if (a.dueAt && b.dueAt && a.dueAt.getTime() !== b.dueAt.getTime()) {
      return a.dueAt.getTime() - b.dueAt.getTime();
    }
    return a.raisedAt.getTime() - b.raisedAt.getTime();
  });
}

export type SituacaoDaExigencia = "abertas" | "resolvidas" | "todas";

export function lerSituacaoDaExigencia(valor: unknown): SituacaoDaExigencia {
  return valor === "resolvidas" || valor === "todas" ? valor : "abertas";
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

/**
 * As colunas, na ordem do fluxo — da esquerda para a direita é o caminho que o
 * processo percorre, e não a ordem de urgência da fila.
 */
export const COLUNAS_DO_KANBAN: SituacaoDoProcesso[] = [
  "EM_ANDAMENTO",
  "AGUARDANDO_ORGAO",
  "EM_EXIGENCIA",
  "CONCLUIDO",
];

/** Janela dos concluídos: o kanban mostra o que acabou de sair, não o arquivo. */
export const DIAS_DE_CONCLUIDOS_RECENTES = 30;

/**
 * Distribui as linhas pelas colunas **preservando a ordem de entrada**.
 *
 * Quem chama já entrega na ordem da fila (`ordenarFila`); reordenar aqui — por
 * prioridade, por exemplo — faria o kanban e a fila discordarem sobre o que
 * vem primeiro.
 */
export function colunasDoKanban<T extends { situacao: SituacaoDoProcesso }>(
  linhas: T[]
): { situacao: SituacaoDoProcesso; linhas: T[] }[] {
  return COLUNAS_DO_KANBAN.map((situacao) => ({
    situacao,
    linhas: linhas.filter((l) => l.situacao === situacao),
  }));
}
