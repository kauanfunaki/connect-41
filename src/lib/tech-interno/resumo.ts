// O resumo do período do Controle interno (06/11/2026, pedido de 05/11): o que
// foi concluído, o que está em andamento e o que está planejado, no dia, na
// semana, no mês ou no ano. Dois públicos: a IA, pelo MCP e pela API
// (`resumo_do_periodo`), que antes teria de ler o histórico inteiro, gastando
// tokens, para saber o que já foi feito; e os devs, na tela.
//
// Tudo sai do histórico dos itens (`TechInternalChange`, campo "Situação"),
// como as Entregas: não há coluna de início nem de fim. Puro e testado; quem
// busca é `resumoTech`, no servidor.

import { SITUACOES, TIPOS, type Alteracao } from "./regras";
import { linhaDoItem, type MudancaParaEntregas } from "./entregas";

export const PERIODOS_DO_RESUMO = [
  { chave: "dia", rotulo: "Dia" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
  { chave: "ano", rotulo: "Ano" },
] as const;
export type PeriodoDoResumo = (typeof PERIODOS_DO_RESUMO)[number]["chave"];

export function ehPeriodoDoResumo(v: unknown): v is PeriodoDoResumo {
  return PERIODOS_DO_RESUMO.some((p) => p.chave === v);
}

const DIA_MS = 24 * 60 * 60 * 1000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "AAAA-MM-DD" de uma data de calendário (meia-noite UTC). */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const calendario = (dataIso: string) => new Date(`${dataIso}T00:00:00Z`);
const br = (dataIso: string, comAno = true) => `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}${comAno ? `/${dataIso.slice(0, 4)}` : ""}`;

export type IntervaloDoResumo = {
  /** O primeiro e o último dia do período, "AAAA-MM-DD", no calendário de São Paulo. */
  primeiroDia: string;
  ultimoDia: string;
  /** Os instantes: [inicio, fim), da meia-noite de São Paulo (UTC−3, sem horário de verão desde 2019). */
  inicio: Date;
  fim: Date;
  rotulo: string;
};

/** O período que contém a data. A semana vai de segunda a domingo. */
export function intervaloDoResumo(periodo: PeriodoDoResumo, dataIso: string): IntervaloDoResumo {
  const d = calendario(dataIso);
  const ano = d.getUTCFullYear(), mes = d.getUTCMonth();
  let primeiro: Date, depois: Date;
  if (periodo === "dia") { primeiro = d; depois = new Date(d.getTime() + DIA_MS); }
  else if (periodo === "semana") { primeiro = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA_MS); depois = new Date(primeiro.getTime() + 7 * DIA_MS); }
  else if (periodo === "mes") { primeiro = new Date(Date.UTC(ano, mes, 1)); depois = new Date(Date.UTC(ano, mes + 1, 1)); }
  else { primeiro = new Date(Date.UTC(ano, 0, 1)); depois = new Date(Date.UTC(ano + 1, 0, 1)); }
  const primeiroDia = iso(primeiro), ultimoDia = iso(new Date(depois.getTime() - DIA_MS));
  const rotulo = periodo === "dia" ? br(primeiroDia)
    : periodo === "semana" ? `${br(primeiroDia, primeiroDia.slice(0, 4) !== ultimoDia.slice(0, 4))} a ${br(ultimoDia)}`
    : periodo === "mes" ? `${MESES[mes]} de ${ano}` : String(ano);
  return { primeiroDia, ultimoDia, inicio: new Date(`${primeiroDia}T00:00:00-03:00`), fim: new Date(`${iso(depois)}T00:00:00-03:00`), rotulo };
}

/** A data do período anterior (-1) ou seguinte (+1), para a navegação da tela. */
export function deslocarPeriodo(periodo: PeriodoDoResumo, dataIso: string, passo: -1 | 1): string {
  const d = calendario(intervaloDoResumo(periodo, dataIso).primeiroDia);
  if (periodo === "dia") return iso(new Date(d.getTime() + passo * DIA_MS));
  if (periodo === "semana") return iso(new Date(d.getTime() + passo * 7 * DIA_MS));
  if (periodo === "mes") return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + passo, 1)));
  return iso(new Date(Date.UTC(d.getUTCFullYear() + passo, 0, 1)));
}

export type ItemParaResumo = {
  id: string;
  /** O número do item no escritório, o do endereço curto (10/11/2026). */
  number: number;
  title: string;
  type: keyof typeof TIPOS;
  status: keyof typeof SITUACOES;
  priority: number;
  systemName: string | null;
  assigneeName: string | null;
  /** O prazo, "AAAA-MM-DD". */
  dueDate: string | null;
  prUrl: string | null;
  createdAt: Date;
};

export type ResumoDoPeriodo = {
  concluidos: (ItemParaResumo & { em: Date })[];
  /** Em andamento ou em validação agora; `mexidoNoPeriodo` diz se o item teve alteração no período. */
  emAndamento: (ItemParaResumo & { mexidoNoPeriodo: boolean })[];
  /** Pendentes que entraram no período ou têm prazo nele. */
  planejados: (ItemParaResumo & { entrouNoPeriodo: boolean; prazoNoPeriodo: boolean })[];
  cancelados: (ItemParaResumo & { em: Date })[];
};

/** A última mudança de "Situação" para `para`, ou null. */
function ultimaPara(id: string, mudancas: MudancaParaEntregas[], para: string): Date | null {
  let quando: Date | null = null;
  for (const m of mudancas) {
    if (m.itemId !== id || !m.changes.some((c: Alteracao) => c.field === "Situação" && c.after === para)) continue;
    if (!quando || m.createdAt > quando) quando = m.createdAt;
  }
  return quando;
}

export function montarResumo(itens: ItemParaResumo[], mudancas: MudancaParaEntregas[], intervalo: Pick<IntervaloDoResumo, "inicio" | "fim" | "primeiroDia" | "ultimoDia">): ResumoDoPeriodo {
  const { inicio, fim, primeiroDia, ultimoDia } = intervalo;
  const dentro = (d: Date | null) => !!d && d >= inicio && d < fim;
  const mexidos = new Set(mudancas.filter((m) => dentro(m.createdAt)).map((m) => m.itemId));
  const r: ResumoDoPeriodo = { concluidos: [], emAndamento: [], planejados: [], cancelados: [] };
  for (const item of itens) {
    if (item.status === "DONE") {
      const em = linhaDoItem(item.id, mudancas).concluidoEm;
      if (em && dentro(em)) r.concluidos.push({ ...item, em });
    } else if (item.status === "CANCELED") {
      const em = ultimaPara(item.id, mudancas, SITUACOES.CANCELED);
      if (em && dentro(em)) r.cancelados.push({ ...item, em });
    } else if (item.status === "IN_PROGRESS" || item.status === "VALIDATION") {
      r.emAndamento.push({ ...item, mexidoNoPeriodo: mexidos.has(item.id) });
    } else {
      const entrouNoPeriodo = dentro(item.createdAt);
      const prazoNoPeriodo = !!item.dueDate && item.dueDate >= primeiroDia && item.dueDate <= ultimoDia;
      if (entrouNoPeriodo || prazoNoPeriodo) r.planejados.push({ ...item, entrouNoPeriodo, prazoNoPeriodo });
    }
  }
  const porTitulo = (a: ItemParaResumo, b: ItemParaResumo) => a.title.localeCompare(b.title, "pt-BR");
  r.concluidos.sort((a, b) => b.em.getTime() - a.em.getTime() || porTitulo(a, b));
  r.cancelados.sort((a, b) => b.em.getTime() - a.em.getTime() || porTitulo(a, b));
  r.emAndamento.sort((a, b) => Number(b.mexidoNoPeriodo) - Number(a.mexidoNoPeriodo) || b.priority - a.priority || porTitulo(a, b));
  r.planejados.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.priority - a.priority || porTitulo(a, b));
  return r;
}

/** O resumo em texto, para colar num canal: uma linha por item, agrupado. */
export function resumoEmTexto(rotulo: string, r: ResumoDoPeriodo, linkDoItem: (item: ItemParaResumo) => string): string {
  const linha = (i: ItemParaResumo, extra = "") => `- ${i.title}${extra} — ${linkDoItem(i)}`;
  const bloco = (titulo: string, linhas: string[]) => (linhas.length ? [`${titulo} (${linhas.length})`, ...linhas, ""] : []);
  return [
    `Controle interno — ${rotulo}`,
    "",
    ...bloco("Concluídos", r.concluidos.map((i) => linha(i, i.prUrl ? ` (PR: ${i.prUrl})` : ""))),
    ...bloco("Em andamento", r.emAndamento.map((i) => linha(i, i.status === "VALIDATION" ? " (em validação)" : ""))),
    ...bloco("Planejados", r.planejados.map((i) => linha(i, i.dueDate ? ` (prazo ${br(i.dueDate)})` : ""))),
    ...bloco("Cancelados", r.cancelados.map((i) => linha(i))),
  ].join("\n").trim();
}
