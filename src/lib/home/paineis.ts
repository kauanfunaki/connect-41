// As contas dos painéis da Home (30/09). Funções puras: a consulta fica em
// `dadosDosPaineis.ts`, e o julgamento — em que faixa cai cada coisa — mora aqui,
// testado, com as mesmas regras das telas de onde os números saem.

import { addDaysToKey, mondayOfWeek } from "@/lib/agenda";

export type Soma = { n: number; centavos: number };

// ─── Contas (BPO) ──────────────────────────────────────────────────────────

/**
 * Vencida e "vence hoje" são as mesmas de `situacaoDaConta` (/pagar e
 * /receber). "Semana" são os próximos 7 dias depois de hoje; o resto é "depois".
 */
export type FaixaDeVencimento = "vencida" | "hoje" | "semana" | "depois";

export function faixaDeVencimento(dueKey: string, hojeKey: string): FaixaDeVencimento {
  if (dueKey < hojeKey) return "vencida";
  if (dueKey === hojeKey) return "hoje";
  if (dueKey <= addDaysToKey(hojeKey, 7)) return "semana";
  return "depois";
}

type Titulo = { kind: "PAGAR" | "RECEBER"; centavos: number; vencimentoKey: string };

export function carteiraPorFaixa(
  titulos: Titulo[],
  kind: Titulo["kind"],
  hojeKey: string
): Record<FaixaDeVencimento, Soma> {
  const faixas: Record<FaixaDeVencimento, Soma> = {
    vencida: { n: 0, centavos: 0 },
    hoje: { n: 0, centavos: 0 },
    semana: { n: 0, centavos: 0 },
    depois: { n: 0, centavos: 0 },
  };
  for (const t of titulos) {
    if (t.kind !== kind) continue;
    const f = faixas[faixaDeVencimento(t.vencimentoKey, hojeKey)];
    f.n += 1;
    f.centavos += t.centavos;
  }
  return faixas;
}

/** Tudo o que está em aberto na carteira, vencido incluído. */
export function totalDaCarteira(f: Record<FaixaDeVencimento, Soma>): Soma {
  return {
    n: f.vencida.n + f.hoje.n + f.semana.n + f.depois.n,
    centavos: f.vencida.centavos + f.hoje.centavos + f.semana.centavos + f.depois.centavos,
  };
}

export type Semana = Soma & { inicioKey: string };

/**
 * O que vence a pagar em cada semana (segunda a domingo), a partir da semana
 * de hoje. O vencido fica de fora: ele já está no painel de contas, e somado
 * na primeira coluna faria "esta semana" parecer maior do que é.
 */
export function aPagarPorSemana(titulos: Titulo[], hojeKey: string, semanas = 6): Semana[] {
  const primeira = mondayOfWeek(hojeKey);
  const colunas: Semana[] = Array.from({ length: semanas }, (_, i) => ({
    inicioKey: addDaysToKey(primeira, i * 7),
    n: 0,
    centavos: 0,
  }));
  const fim = addDaysToKey(primeira, semanas * 7);
  for (const t of titulos) {
    if (t.kind !== "PAGAR" || t.vencimentoKey < hojeKey || t.vencimentoKey >= fim) continue;
    let i = colunas.length - 1;
    while (colunas[i].inicioKey > t.vencimentoKey) i -= 1;
    colunas[i].n += 1;
    colunas[i].centavos += t.centavos;
  }
  return colunas;
}

// ─── Pendências (BPO) ──────────────────────────────────────────────────────

/**
 * As pendências abertas em três partes que não se sobrepõem, para caberem
 * numa barra só. Vencida é a mesma de /pendencias (aberta ou respondida com
 * prazo antes de hoje) e sai das outras duas.
 */
export function faixasDasPendencias(c: {
  aguardando: number;
  respondidas: number;
  vencidasAguardando: number;
  vencidasRespondidas: number;
}): { vencidas: number; respondidas: number; aguardando: number } {
  return {
    vencidas: c.vencidasAguardando + c.vencidasRespondidas,
    respondidas: Math.max(c.respondidas - c.vencidasRespondidas, 0),
    aguardando: Math.max(c.aguardando - c.vencidasAguardando, 0),
  };
}

// ─── Tarefas ───────────────────────────────────────────────────────────────

export type FaixaDaTarefa = "atrasada" | "hoje" | "adiante" | "sem_prazo";

/** Mesmo corte do "Meu dia": vencido é antes de hoje, "hoje" é até o fim do dia. */
export function contarTarefas(
  itens: { dueDate: Date | null }[],
  inicioDeHoje: Date,
  fimDeHoje: Date
): Record<FaixaDaTarefa, number> {
  const c: Record<FaixaDaTarefa, number> = { atrasada: 0, hoje: 0, adiante: 0, sem_prazo: 0 };
  for (const i of itens) {
    if (!i.dueDate) c.sem_prazo += 1;
    else if (i.dueDate < inicioDeHoje) c.atrasada += 1;
    else if (i.dueDate <= fimDeHoje) c.hoje += 1;
    else c.adiante += 1;
  }
  return c;
}

// ─── Férias (DP) ───────────────────────────────────────────────────────────

/** Antecedência do aviso de férias a vencer, em dias. */
export const AVISO_DAS_FERIAS_DIAS = 60;

/**
 * Vencida é a de /ferias (fim do período concessivo antes de agora). "A
 * vencer" é quem vence nos próximos 60 dias — o prazo em que ainda dá para
 * programar sem pagar em dobro. Sem período concessivo conta como no prazo.
 */
export function contarFerias(
  ferias: { concessivePeriodEnd: Date | null }[],
  agora: Date
): { vencidas: number; aVencer: number; noPrazo: number } {
  const limite = new Date(agora.getTime() + AVISO_DAS_FERIAS_DIAS * 86_400_000);
  const c = { vencidas: 0, aVencer: 0, noPrazo: 0 };
  for (const f of ferias) {
    const fim = f.concessivePeriodEnd;
    if (fim && fim < agora) c.vencidas += 1;
    else if (fim && fim <= limite) c.aVencer += 1;
    else c.noPrazo += 1;
  }
  return c;
}
